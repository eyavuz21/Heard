"""Configuration. Everything tunable lives here, nothing tunable lives anywhere else."""

from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()

REPO_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gemini_api_key: str = ""
    elevenlabs_api_key: str = ""

    # Audio-native recognition. Flash for the live path -- latency is the demo, since
    # someone is standing at a counter waiting for this.
    #
    # Deliberately an alias, not a pinned version: gemini-2.5-flash was hardcoded here
    # and had already been retired for new users, which failed at runtime rather than
    # at review. Aliases track forward. Compare against gemini-pro-latest with
    # `uv run python evals/compare_models.py` before assuming either is better.
    # Pro, measured on real dysarthric audio, roughly halved the error rate versus Flash
    # -- and the difference landed on the words that carry meaning. Flash rendered "think
    # of me like a regular adult" as "a retard", "an idiot", "an ignorant adult"; Pro
    # recovered it correctly. That is not a scoring difference, it is a different product.
    gemini_model: str = "gemini-pro-latest"

    # The gate samples the model N times in parallel and uses disagreement between
    # the samples as a confidence signal, because a model's self-reported confidence
    # grades its own work. Parallel, so N samples cost one call of latency.
    # Load-bearing, not a tuning knob. Fed pure silence under a rich context, single
    # samples returned confident inventions ("Don't give up." at 0.95). Three samples
    # returned three DIFFERENT inventions, and the disagreement caught it. Lowering this
    # to 1 reopens that hole. Five rather than three because the samples also vote
    # word-by-word now, and more voters make that vote sharper.
    gate_samples: int = 5
    gate_temperature: float = 1.0

    # Per-sample deadline. The gate already tolerates individual samples failing, so a
    # straggler is dropped rather than allowed to hold up the whole utterance: measured
    # median latency is ~10s but the tail runs to minutes, and asyncio.gather waits for
    # the slowest. Four samples now beats five in three minutes, with someone standing at
    # a counter waiting to be understood.
    # 25s against a measured median of ~10s: generous, so nearly every sample reaches the
    # vote, and the vote is what catches fabrication. Only genuine stragglers are dropped.
    # Cutting this trades recovery quality for speed -- if you lower it, re-check that the
    # silence probe still gets flagged.
    sample_timeout_seconds: float = 25.0

    # MINIMAL / LOW / MEDIUM / HIGH, or None for the model's own default.
    thinking_level: str | None = "HIGH"

    # Below this, the frontend shows alternates instead of a single guess. This is a
    # presentation threshold, not a safety one -- nothing is ever spoken without a
    # confirm tap, so a miscalibrated score costs a tap, not a wrong sentence.
    confidence_threshold: float = 0.75

    # How much context the prompt compiler is allowed to inject. These are the dials
    # to turn down if the confabulation eval shows the model drifting toward context.
    max_confirmed_pairs: int = 30
    max_thread_turns: int = 6
    max_vocabulary_words: int = 40

    profile_db_path: Path = REPO_ROOT / "data" / "profiles.db"


settings = Settings()
