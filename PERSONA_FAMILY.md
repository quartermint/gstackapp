# Persona Family — Dependency Chain

Three projects work together to produce a fine-tuned persona AI model.

## Data Flow

```
persona-pipeline (Mac Mini)
  → Extracts 700K+ messages from 4 sources (email, iMessage, GVoice, Slack)
  → Produces ChatML JSONL via quality pipeline + dedup
  → Output: ~/persona-pipeline/data/output/{train,valid,dpo_pairs}.jsonl

rss_rawdata (MacBook → GCP)
  → FinetuneDataLoader reads finetune_dataset_full.jsonl
  → Trains Qwen3.5-35B-A3B-4bit (MoE) adapter
  → Input: ~/rss_rawdata/data/training_data/finetune_dataset_full.jsonl

mission-control (MacBook)
  → Dashboard tracking all 3 projects
  → Git state, GSD phases, recent commits
```

## Bridge Command

Copy persona-pipeline output into rss_rawdata's training input:

```bash
ssh mac-mini-host
cd ~/persona-pipeline && source .venv/bin/activate
python -m persona_pipeline run -v
cat data/output/train.jsonl data/output/valid.jsonl > ~/rss_rawdata/data/training_data/finetune_dataset_full.jsonl
```

## Project Locations

| Project | MacBook | Mac Mini | Primary |
|---------|---------|----------|---------|
| persona-pipeline | ~/persona-pipeline | ~/persona-pipeline | Mac Mini (data sources) |
| rss_rawdata | ~/rss_rawdata | ~/rss_rawdata | MacBook (development) |
| mission-control | ~/mission-control | — | MacBook |

## Key Config Files

- **persona-pipeline config:** `~/persona-pipeline/persona-pipeline.yaml` (Mac Mini)
- **rss_rawdata env:** `~/rss_rawdata/.env.local` (MacBook)
- **mission-control config:** `~/mission-control/mc.config.json` (MacBook)
- **Training data bridge:** `~/rss_rawdata/data/training_data/finetune_dataset_full.jsonl`

## Integration Points

1. **persona-pipeline → rss_rawdata:** ChatML JSONL concatenated into `finetune_dataset_full.jsonl`
2. **rss_rawdata → GCP:** Training jobs pushed to cloud compute
3. **mission-control → all:** Git scanner reads `.planning/` dirs for GSD state
