import re
from typing import Literal, Optional
from pydantic import BaseModel, Field, computed_field

Scenario = Literal["iss", "lunar_habitat", "lunar_rover", "mars_transit"]
SafetyDomain = Literal["prevention", "material_flammability", "smoke_detection", "suppression"]
Lang = Literal["en", "ru"]


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    limit: int = Field(10, ge=1, le=30)
    lang: Lang = "en"


class AssistantRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=800)
    lang: Lang = "en"


class CompareRequest(BaseModel):
    ids: list[str] = Field(..., min_length=2, max_length=4)
    lang: Lang = "en"


class RiskRequest(BaseModel):
    scenario: Scenario
    domain: SafetyDomain
    lang: Lang = "en"


class Finding(BaseModel):
    text: str
    source_id: str


class Investigation(BaseModel):
    id: str
    acronym: str
    full_name: str
    fuel_type: str
    fuel_material: str
    gravity_environment: str
    objective: str
    oxygen_concentration: Optional[float] = None
    airflow_speed: Optional[float] = None
    hardware: str
    measurement_types: list[str]
    research_domain: str
    fire_safety_domain: str
    relevance: list[str]
    relevance_note: str = ""
    known_conditions: list[str]
    findings: list[Finding]
    limitations: list[str]
    related: list[str]
    source_ids: list[str]
    record_type: str
    numeric_data_status: str


class Source(BaseModel):
    id: str
    title: str
    publisher: str
    type: str
    url: str
    note: str = ""

    @computed_field  # type: ignore[prop-decorator]
    @property
    def link_kind(self) -> str:
        """How the URL resolves: 'search' (catalog query, not a specific document), 'portal' (site root) or 'direct'."""
        if "/search" in self.url or "?q=" in self.url:
            return "search"
        if re.fullmatch(r"https?://[^/]+/?", self.url):
            return "portal"
        return "direct"
