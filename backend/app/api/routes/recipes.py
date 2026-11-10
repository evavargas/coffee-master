"""Recipe catalog endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rate_limit import recipes_rate_limit
from app.db.session import get_db
from app.models.user import User
from app.schemas.recipe import CatalogRecipeOut, RecipeListResponse, RecipeMethod
from app.services import recipes as recipes_service

router = APIRouter(prefix="/api/recipes", tags=["recipes"], dependencies=[recipes_rate_limit])

_AUTH_RESPONSES = {
    401: {"description": "Missing, invalid or expired session"},
    429: {"description": "Too many requests from this IP"},
}


@router.get(
    "",
    response_model=RecipeListResponse,
    summary="List catalog recipes",
    description=(
        "Validated, non-archived catalog recipes ordered by name. `q` is a case-insensitive substring search "
        "over recipe name, description and coffee name (trimmed, up to 100 characters, empty means no search). "
        "A `q` longer than 100 characters is rejected with 422, not truncated. "
        "`method` filters by brew method. `is_saved` and `is_favorite` reflect the caller's own library. "
        "`total` counts every match, but a page can hold fewer than `limit` items when a stored recipe is "
        "unreadable, so advance `offset` by `limit`, never by the number of items returned. "
        "Invalid `q`, `method`, `limit` or `offset` give 422. Requires a bearer token."
    ),
    responses=_AUTH_RESPONSES,
)
def list_recipes(
    q: Annotated[str | None, Query(max_length=100)] = None,
    method: RecipeMethod | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecipeListResponse:
    items, total = recipes_service.list_catalog(db, current_user.id, (q or "").strip() or None, method, limit, offset)
    return RecipeListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get(
    "/{slug}",
    response_model=CatalogRecipeOut,
    summary="Get a catalog recipe",
    description=(
        "One catalog recipe by slug. An archived recipe is returned (with `archived: true`) only to a user "
        "who has it saved; anyone else gets the same 404 as for an unknown slug. Requires a bearer token."
    ),
    responses={**_AUTH_RESPONSES, 404: {"description": "Recipe not found"}},
)
def get_recipe(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CatalogRecipeOut:
    recipe = recipes_service.get_catalog(db, current_user.id, slug)
    if recipe is None:
        raise HTTPException(status_code=404, detail="Receta no encontrada.")
    return recipe
