# Random Forest cumulative-dose model

The current `RandomForestRegressor` estimates cumulative exposure in `ppm·h`.
Its empirical anchors are extracted from the first three swatches of
`reference_scale_first3.png`: 0, 1–5, and 5–15 ppm·h. Higher-dose brown/black
behavior is declared synthetic extrapolation.

The continuous estimate is mapped to UNEXPOSED/LOW/MODERATE/HIGH/CRITICAL with
the same risk objects used by the existing UI. It is a prototype estimate, not
independently validated dosimetry.

The browser preserves `ppm·h` internally and reports the shift-normalized value
as `ppm/8h = cumulative ppm·h / 8`. This is an estimated 8-hour TWA presentation,
not an instantaneous concentration measurement.

Retrain from the repository root:

```powershell
.\.venv\Scripts\python.exe ml\train_experimental_model.py
```
