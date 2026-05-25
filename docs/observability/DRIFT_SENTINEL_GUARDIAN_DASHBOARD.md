# Drift Sentinel and Guardian Dashboard

This directory provides public operator templates for the two v2.4 safety
signals that need to be visible outside the kernel code:

- `mcop_drift_sentinel_delta_td_be`: Drift Sentinel Delta(T_d, B_e)
- `mcop_guardian_grounding_floor`: Guardian grounding-floor score
- `mcop_guardian_grounding_floor_verdict`: `1` when the floor passes, `0` when it fails

## Thresholds

| Signal | Watch | Critical | Operator action |
| --- | ---: | ---: | --- |
| Drift Sentinel Delta(T_d, B_e) | `>= 0.25` | `>= 0.70` | inspect recent traces and adapter inputs |
| Guardian grounding floor | `< 0.70` | `< 0.55` | hold dispatch or require human review |
| Combined injection risk | Delta `>= 0.70` and floor `< 0.70` | same condition for 5 minutes | quarantine synthesis and preserve provenance |

## Templates

- Grafana: `drift-sentinel-guardian.grafana.json`
- Datadog: `drift-sentinel-guardian.datadog.json`

The defaults are conservative. Calibrate them only after an external adopter has
used the dashboard and reported a real injection-attack detection.
