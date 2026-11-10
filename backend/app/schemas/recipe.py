"""Recipe models shared by the API, the chat tool schema and the knowledge frontmatter."""

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

TEMPERATURE_MIN_C = 60.0
TEMPERATURE_MAX_C = 100.0
RATIO_TOLERANCE = 0.05


class BookFilter(StrEnum):
    ALL = "all"
    FAVORITES = "favorites"
    CREATED = "created"
    SAVED = "saved"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class RecipeMethod(StrEnum):
    V60 = "v60"
    FRENCH_PRESS = "french_press"
    MOKA = "moka"
    AEROPRESS = "aeropress"
    ESPRESSO = "espresso"
    COLD_BREW = "cold_brew"
    OTHER = "other"


class RecipeGoal(StrEnum):
    SWEETNESS = "sweetness"
    BALANCE = "balance"
    ACIDITY = "acidity"


class RecipeStatus(StrEnum):
    VALIDATED = "validated"
    TESTING = "testing"
    NOT_RECOMMENDED = "not_recommended"


class Range(_Strict):
    min: float
    max: float | None = None

    @model_validator(mode="after")
    def check_order(self) -> Self:
        if self.max is not None and self.min > self.max:
            raise ValueError("min must be less than or equal to max")
        return self

    @property
    def mid(self) -> float:
        return self.min if self.max is None else (self.min + self.max) / 2

    @property
    def upper(self) -> float:
        return self.min if self.max is None else self.max


class Coffee(_Strict):
    name: str | None = Field(default=None, max_length=120)
    origin: str | None = Field(default=None, max_length=120)
    process: str | None = Field(default=None, max_length=120)
    roast: str | None = Field(default=None, max_length=120)
    with_milk: bool | None = Field(default=None, description="False means never with milk.")


class Grind(_Strict):
    grinder: str | None = Field(default=None, max_length=120)
    clicks: Range | None = None
    description: str | None = Field(default=None, max_length=300)


class Step(_Strict):
    at_seconds: int | None = None
    action: str = Field(max_length=500)
    pour_to_g: float | None = Field(default=None, description="Cumulative water poured, in grams.")


class RecipeData(_Strict):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    method: RecipeMethod
    goal: RecipeGoal | None = None
    coffee: Coffee | None = None
    dose_g: Range | None = None
    water_g: Range | None = None
    temperature_c: Range | None = None
    ratio: float | None = Field(
        default=None,
        description="Grams of water per gram of coffee (espresso: grams of drink per gram, with water_g null).",
    )
    grind: Grind | None = None
    brew_time_seconds: Range | None = None
    yield_ml: Range | None = None
    steps: list[Step] = Field(default_factory=list, max_length=30)
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def check_temperature(self) -> Self:
        temp = self.temperature_c
        if temp is not None and not (
            TEMPERATURE_MIN_C <= temp.min and temp.upper <= TEMPERATURE_MAX_C
        ):
            raise ValueError(
                f"temperature_c must be between {TEMPERATURE_MIN_C:g} and {TEMPERATURE_MAX_C:g} degrees C"
            )
        return self

    @model_validator(mode="after")
    def check_ratio(self) -> Self:
        if self.ratio is None or self.water_g is None or self.dose_g is None:
            return self
        if self.dose_g.mid <= 0:
            raise ValueError("dose_g must be greater than zero")
        expected = self.water_g.mid / self.dose_g.mid
        if abs(self.ratio - expected) > expected * RATIO_TOLERANCE:
            raise ValueError(
                f"ratio {self.ratio:g} is not within 5% of water_g/dose_g ({expected:.2f})"
            )
        return self

    @model_validator(mode="after")
    def check_steps(self) -> Self:
        times = [s.at_seconds for s in self.steps if s.at_seconds is not None]
        if times != sorted(times):
            raise ValueError("at_seconds must not decrease across steps")
        pours = [s.pour_to_g for s in self.steps if s.pour_to_g is not None]
        if pours != sorted(pours):
            raise ValueError("pour_to_g must not decrease across steps")
        if pours and self.water_g is not None and pours[-1] > self.water_g.upper:
            raise ValueError("pour_to_g must not exceed water_g max")
        return self


class RecipeRef(_Strict):
    kind: Literal["catalog", "user"]
    ref: str | StrictInt = Field(description="Slug for catalog recipes, integer id for user recipes.")


class RecipeSource(_Strict):
    document: str = Field(description="Internal relative path of the source file. Clients must not display it, use the recipe name.")
    section: str | None = None


class CatalogRecipeOut(RecipeData):
    slug: str
    status: RecipeStatus
    source: RecipeSource
    archived: bool = False
    is_saved: bool = False
    is_favorite: bool = False


class RecipeListResponse(BaseModel):
    items: list[CatalogRecipeOut]
    total: int
    limit: int
    offset: int


class FavoriteUpdate(_Strict):
    is_favorite: bool


class LibraryEntryOut(BaseModel):
    slug: str
    is_saved: bool
    is_favorite: bool


class UserRecipeOut(RecipeData):
    id: int
    parent: RecipeRef | None = None
    is_favorite: bool = False
    conversation_id: int | None = None
    created_at: datetime
    updated_at: datetime


class UserRecipeCreate(_Strict):
    """Exactly one of `recipe` (manual) or `proposal_id` (copy of a chat proposal, with optional overrides)."""

    recipe: RecipeData | None = None
    proposal_id: int | None = Field(default=None, ge=1)
    overrides: dict[str, Any] | None = Field(
        default=None, max_length=30, description="Partial RecipeData merged over the proposal, validated again."
    )

    @model_validator(mode="after")
    def check_one_source(self) -> Self:
        if (self.recipe is None) == (self.proposal_id is None):
            raise ValueError("send exactly one of `recipe` or `proposal_id`")
        if self.overrides is not None and self.proposal_id is None:
            raise ValueError("`overrides` only applies with `proposal_id`")
        return self


class BookCatalogItem(BaseModel):
    kind: Literal["catalog"]
    recipe: CatalogRecipeOut


class BookUserItem(BaseModel):
    kind: Literal["user"]
    recipe: UserRecipeOut


BookItemOut = Annotated[BookCatalogItem | BookUserItem, Field(discriminator="kind")]


class BookListResponse(BaseModel):
    items: list[BookItemOut]
    total: int
    limit: int
    offset: int
