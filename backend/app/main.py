from __future__ import annotations

import csv
import io
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from decimal import Decimal
from typing import Any
from urllib.parse import quote
from uuid import UUID

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import app.models  # noqa: F401  # register SQLAlchemy mappers for Alembic / metadata

from app.core.config import get_settings
from app.db.session import get_async_session
from app.models.draft import DraftQueueEntry
from app.models.enums import NFLTeam, PlayerPosition, TradeStatus
from app.models.league import League
from app.models.player import Player
from app.models.roster import RosterEntry
from app.models.team import Team
from app.models.trade import Trade
from app.models.user import User
from app.websocket.manager import draft_channel, get_broker, trade_feed_channel

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

_settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    import app.websocket.manager as ws_manager

    broker = get_broker(_settings.redis_url)
    await broker.start()
    app.state.ws_broker = broker
    yield
    await broker.shutdown()
    ws_manager._broker = None

app = FastAPI(title=_settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TeamRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    league_id: UUID
    user_id: UUID
    name: str
    draft_position: int | None
    faab_budget_minor: Decimal


class PlayerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    external_ref: str | None
    full_name: str
    position: PlayerPosition
    nfl_team: NFLTeam | None


class DraftQueueRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    team_id: UUID
    player_id: UUID
    sort_order: int


class RosterEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    team_id: UUID
    player_id: UUID
    is_keeper: bool


class TradeParticipantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    trade_id: UUID
    team_id: UUID
    team_order: int


class TradeItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    trade_id: UUID
    asset_id: UUID
    from_team_id: UUID
    to_team_id: UUID


class TradeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    league_id: UUID
    status: TradeStatus
    proposed_by_team_id: UUID
    message: str | None
    executed_at: datetime | None
    participants: list[TradeParticipantRead]
    items: list[TradeItemRead]


class LeagueRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str


class DraftSessionResponse(BaseModel):
    league: LeagueRead
    teams: list[TeamRead]
    players: list[PlayerRead]
    draft_queue_entries: list[DraftQueueRead]
    roster_entries: list[RosterEntryRead]
    trades: list[TradeRead]


class TeamUpdate(BaseModel):
    id: UUID
    name: str | None = None
    draft_position: int | None = None
    faab_budget_minor: Decimal | None = None


class DraftQueueWrite(BaseModel):
    team_id: UUID
    player_id: UUID
    sort_order: int = 0


class RosterEntryUpdate(BaseModel):
    id: UUID
    is_keeper: bool


class TradeStatusUpdate(BaseModel):
    id: UUID
    status: TradeStatus
    message: str | None = None
    executed_at: datetime | None = None


class DraftSessionUpdateRequest(BaseModel):
    team_updates: list[TeamUpdate] = []
    draft_queue_entries: list[DraftQueueWrite] | None = None
    roster_entry_updates: list[RosterEntryUpdate] = []
    trade_status_updates: list[TradeStatusUpdate] = []


class BulkPlayerUploadResult(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: list[str]


class QuickCreateLeagueRequest(BaseModel):
    league_name: str
    commissioner_email: str
    commissioner_display_name: str
    team_names: list[str]


class QuickCreateLeagueResponse(BaseModel):
    league_id: UUID
    commissioner_user_id: UUID
    team_ids: list[UUID]


class CommissionerTradeApprovalResponse(BaseModel):
    trade_id: UUID
    status: TradeStatus
    executed_at: datetime | None


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/commissioner/leagues/quick-create", response_model=QuickCreateLeagueResponse)
async def commissioner_quick_create_league(
    payload: QuickCreateLeagueRequest,
    session: AsyncSession = Depends(get_async_session),
) -> QuickCreateLeagueResponse:
    league_name = payload.league_name.strip()
    league_slug = "-".join(league_name.split(" ")).lower()
    commissioner_email = payload.commissioner_email.strip().lower()
    team_names = [name.strip() for name in payload.team_names if name.strip()]

    if not league_name or not league_slug or not commissioner_email:
        raise HTTPException(status_code=400, detail="league_name, league_slug, and commissioner_email are required")
    if len(team_names) < 2:
        raise HTTPException(status_code=400, detail="At least two teams are required")

    existing_league = await session.scalar(select(League).where(League.slug == league_slug))
    if existing_league is not None:
        raise HTTPException(status_code=409, detail="League slug already exists")

    commissioner = await session.scalar(select(User).where(User.email == commissioner_email))
    if commissioner is None:
        commissioner = User(
            email=commissioner_email,
            display_name="-".join(payload.commissioner_display_name.split(" ")).lower() if payload.commissioner_display_name else commissioner_email.split("@")[0],
        )
        session.add(commissioner)
        await session.flush()

    league = League(name=league_name, slug=league_slug, commissioner_user_id=commissioner.id)
    session.add(league)
    await session.flush()

    created_team_ids: list[UUID] = []
    for idx, team_name in enumerate(team_names, start=1):
        user_obj = await session.scalar(select(User).where(User.display_name == team_name))
        if user_obj is None:
            raise HTTPException(status_code=404, detail=f"User for team {team_name} not found. Please create the user first.")
            
        team = Team(
            league_id=league.id,
            user_id=user_obj.id,
            name=team_name,
            draft_position=idx,
        )
        session.add(team)
        await session.flush()
        created_team_ids.append(team.id)

    await session.commit()
    return QuickCreateLeagueResponse(
        league_id=league.id,
        commissioner_user_id=commissioner.id,
        team_ids=created_team_ids,
    )


@app.get("/api/leagues/{league_id}/draft-session", response_model=DraftSessionResponse)
async def get_draft_session(
    league_id: UUID,
    session: AsyncSession = Depends(get_async_session),
) -> DraftSessionResponse:
    league = await session.get(League, league_id)
    if league is None:
        raise HTTPException(status_code=404, detail="League not found")

    teams = list((await session.scalars(select(Team).where(Team.league_id == league_id))).all())
    players = list((await session.scalars(select(Player).order_by(Player.full_name))).all())
    draft_queue_entries = list(
        (
            await session.scalars(
                select(DraftQueueEntry)
                .join(Team, Team.id == DraftQueueEntry.team_id)
                .where(Team.league_id == league_id)
                .order_by(DraftQueueEntry.sort_order)
            )
        ).all()
    )
    roster_entries = list(
        (
            await session.scalars(
                select(RosterEntry).join(Team, Team.id == RosterEntry.team_id).where(Team.league_id == league_id)
            )
        ).all()
    )
    trades = list(
        (
            await session.scalars(
                select(Trade)
                .where(Trade.league_id == league_id)
                .options(selectinload(Trade.participants), selectinload(Trade.items))
                .order_by(Trade.created_at.desc())
            )
        ).all()
    )

    return DraftSessionResponse(
        league=LeagueRead.model_validate(league),
        teams=[TeamRead.model_validate(team) for team in teams],
        players=[PlayerRead.model_validate(player) for player in players],
        draft_queue_entries=[DraftQueueRead.model_validate(entry) for entry in draft_queue_entries],
        roster_entries=[RosterEntryRead.model_validate(entry) for entry in roster_entries],
        trades=[TradeRead.model_validate(trade) for trade in trades],
    )


@app.put("/api/leagues/{league_id}/draft-session", response_model=DraftSessionResponse)
async def update_draft_session(
    league_id: UUID,
    payload: DraftSessionUpdateRequest,
    session: AsyncSession = Depends(get_async_session),
) -> DraftSessionResponse:
    league = await session.get(League, league_id)
    if league is None:
        raise HTTPException(status_code=404, detail="League not found")

    for update in payload.team_updates:
        team = await session.get(Team, update.id)
        if team is None or team.league_id != league_id:
            continue
        if update.name is not None:
            team.name = update.name
        if update.draft_position is not None:
            team.draft_position = update.draft_position
        if update.faab_budget_minor is not None:
            team.faab_budget_minor = update.faab_budget_minor

    if payload.draft_queue_entries is not None:
        team_ids = list((await session.scalars(select(Team.id).where(Team.league_id == league_id))).all())
        if team_ids:
            await session.execute(delete(DraftQueueEntry).where(DraftQueueEntry.team_id.in_(team_ids)))
        for entry in payload.draft_queue_entries:
            if entry.team_id not in team_ids:
                continue
            session.add(
                DraftQueueEntry(
                    team_id=entry.team_id,
                    player_id=entry.player_id,
                    sort_order=entry.sort_order,
                )
            )

    for update in payload.roster_entry_updates:
        roster_entry = await session.get(RosterEntry, update.id)
        if roster_entry is None:
            continue
        team = await session.get(Team, roster_entry.team_id)
        if team is None or team.league_id != league_id:
            continue
        roster_entry.is_keeper = update.is_keeper

    for update in payload.trade_status_updates:
        trade = await session.get(Trade, update.id)
        if trade is None or trade.league_id != league_id:
            continue
        trade.status = update.status
        if update.message is not None:
            trade.message = update.message
        trade.executed_at = update.executed_at

    await session.commit()
    return await get_draft_session(league_id=league_id, session=session)


@app.put(
    "/api/leagues/{league_id}/commissioner/trades/{trade_id}/approve",
    response_model=CommissionerTradeApprovalResponse,
)
async def commissioner_approve_trade(
    league_id: UUID,
    trade_id: UUID,
    session: AsyncSession = Depends(get_async_session),
) -> CommissionerTradeApprovalResponse:
    trade = await session.get(Trade, trade_id)
    if trade is None or trade.league_id != league_id:
        raise HTTPException(status_code=404, detail="Trade not found")
    if trade.status not in {TradeStatus.ACCEPTED, TradeStatus.PENDING_LEAGUE_VOTE, TradeStatus.PROPOSED}:
        raise HTTPException(status_code=400, detail="Trade cannot be approved from current status")

    trade.status = TradeStatus.COMMISSIONER_EXECUTED
    trade.executed_at = datetime.now().astimezone()
    await session.commit()
    return CommissionerTradeApprovalResponse(
        trade_id=trade.id,
        status=trade.status,
        executed_at=trade.executed_at,
    )


@app.get("/api/leagues/{league_id}/commissioner/export/draft-results.csv")
async def commissioner_export_draft_results(
    league_id: UUID,
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    league = await session.get(League, league_id)
    if league is None:
        raise HTTPException(status_code=404, detail="League not found")

    rows = (
        await session.execute(
            select(
                Team.name,
                Player.full_name,
                Player.position,
                Player.nfl_team,
                RosterEntry.is_keeper,
            )
            .join(RosterEntry, RosterEntry.team_id == Team.id)
            .join(Player, Player.id == RosterEntry.player_id)
            .where(Team.league_id == league_id)
            .order_by(Team.name, Player.full_name)
        )
    ).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["team_name", "player_name", "position", "nfl_team", "keeper"])
    for team_name, player_name, position, nfl_team, keeper in rows:
        writer.writerow(
            [
                team_name,
                player_name,
                str(position.value if hasattr(position, "value") else position),
                str(nfl_team.value if nfl_team is not None and hasattr(nfl_team, "value") else nfl_team or ""),
                "true" if keeper else "false",
            ]
        )

    filename = f"{quote(league.slug)}-draft-results.csv"
    return Response(
        content=output.getvalue().encode("utf-8"),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/players/bulk-upload-csv", response_model=BulkPlayerUploadResult)
async def bulk_upload_players_csv(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_async_session),
) -> BulkPlayerUploadResult:
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload must be a CSV file")

    raw = await file.read()
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be utf-8 encoded") from exc

    reader = csv.DictReader(io.StringIO(content))
    required_cols = {"full_name", "position"}
    if not reader.fieldnames or not required_cols.issubset(set(reader.fieldnames)):
        raise HTTPException(status_code=400, detail="CSV must include full_name and position columns")

    created = 0
    updated = 0
    skipped = 0
    errors: list[str] = []

    for idx, row in enumerate(reader, start=2):
        full_name = (row.get("full_name") or "").strip()
        position_raw = (row.get("position") or "").strip().upper()
        nfl_team_raw = (row.get("nfl_team") or "").strip().upper()
        external_ref = (row.get("external_ref") or "").strip() or None

        if not full_name or not position_raw:
            skipped += 1
            errors.append(f"line {idx}: missing full_name or position")
            continue

        try:
            position = PlayerPosition(position_raw)
        except ValueError:
            skipped += 1
            errors.append(f"line {idx}: invalid position '{position_raw}'")
            continue

        nfl_team = None
        if nfl_team_raw:
            try:
                nfl_team = NFLTeam(nfl_team_raw)
            except ValueError:
                skipped += 1
                errors.append(f"line {idx}: invalid nfl_team '{nfl_team_raw}'")
                continue

        stmt = None
        if external_ref:
            stmt = select(Player).where(Player.external_ref == external_ref)
        else:
            stmt = select(Player).where(Player.full_name == full_name, Player.position == position, Player.nfl_team == nfl_team)
        existing = await session.scalar(stmt)
        if existing is None:
            session.add(
                Player(
                    full_name=full_name,
                    position=position,
                    nfl_team=nfl_team,
                    external_ref=external_ref,
                )
            )
            created += 1
        else:
            existing.full_name = full_name
            existing.position = position
            existing.nfl_team = nfl_team
            if external_ref:
                existing.external_ref = external_ref
            updated += 1

    await session.commit()
    return BulkPlayerUploadResult(created=created, updated=updated, skipped=skipped, errors=errors[:50])


@app.websocket("/ws/draft/{league_id}")
async def draft_room_socket(websocket: WebSocket, league_id: UUID) -> None:
    broker = app.state.ws_broker
    channel = draft_channel(league_id)
    await broker.connect(websocket, channel)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("Draft websocket disconnected league_id=%s", league_id)
    finally:
        await broker.disconnect(websocket, channel)


@app.websocket("/ws/trades/{league_id}")
async def trade_feed_socket(websocket: WebSocket, league_id: UUID) -> None:
    broker = app.state.ws_broker
    channel = trade_feed_channel(league_id)
    await broker.connect(websocket, channel)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("Trade feed websocket disconnected league_id=%s", league_id)
    finally:
        await broker.disconnect(websocket, channel)


@app.post("/internal/dev/publish-draft-event/{league_id}")
async def publish_draft_smoke(league_id: UUID, body: dict[str, Any]) -> dict[str, str]:
    """Temporary helper to exercise Redis fan-out; replace with real draft routes."""

    broker: Any = app.state.ws_broker
    channel = draft_channel(league_id)
    await broker.publish(channel, {"type": "draft_event", **body})
    return {"channel": channel}


@app.post("/internal/dev/publish-trade-event/{league_id}")
async def publish_trade_smoke(league_id: UUID, body: dict[str, Any]) -> dict[str, str]:
    broker: Any = app.state.ws_broker
    channel = trade_feed_channel(league_id)
    await broker.publish(channel, {"type": "trade_event", **body})
    return {"channel": channel}
