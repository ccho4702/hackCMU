# Facial delivery scores

You cannot optimize a vibe. `heuristic_v2` is the objective function: four 0–100
scalars a speaker can raise **in a specific second**. The maps are deterministic
(`backend/app/scoring/heuristic_v1.py`). Missing face/gaze/pose is `null`, never a fake 0.

**Unit — Sanchez-Lozano et al., IEEE TAFFC 2021.** Facial expression is local
Action Unit intensity (FACS 0–5), not an emotion class. MediaPipe blendshapes
are mapped onto AU channels and read as intensity / 5 (0–1). Blinks and eye-look
are excluded so they are not counted as “expressiveness.”

**Time — Kimani et al., ICMI 2020.** Audience ratings change over the talk, so
one whole-talk score is not actionable. We score every 1 s window (0.5 s stride).
Their positive gaze rule was ~80% time on the audience; we score
`0.70 × occupancy + 0.30 × residual drift`, with occupancy breakpoints centered
near 80%.

**What to measure — Dimitriadou & Lanitis, Multimedia Tools and Applications 2024.**
Lecture style is a set of measurable biometrics (facial expression, facial pose,
activity), reported both per frame and for the whole talk. That is our four axes:
AU-intensity velocity, AU range/diversity, head angular speed + jitter, gaze occupancy.

**Why a score at all — Ochoa & Domínguez, BJET 2020.** In a semester RCT,
automated presentation feedback improved the next talk when a human scored it
again. Timestamped alerts exist so the number is a practice target, not a label.

| Metric | Computation | Paper it implements |
| --- | --- | --- |
| Gaze | Share of the window with camera deviation ≤ 0.22, mixed with mean drift | Kimani et al. 2020 occupancy rule |
| Expression | L2 velocity of AU intensities; frozen low-intensity windows are capped | Sanchez-Lozano et al. 2021 intensity dynamics |
| Stability | Head angular speed (inverted-U) minus high-frequency jitter | Dimitriadou & Lanitis 2024 facial pose / activity |
| Expressiveness | Mean AU p90–p10 range + fraction of AUs that actually move | Sanchez-Lozano intensity + Dimitriadou expression range |

OpenOPAF (Ochoa & Zhao, *JLA* 2024) already feedbacks gaze and posture from
MediaPipe and notes facial expression as the underused channel. AU-intensity
scoring is that channel.

1. Sanchez-Lozano, E., Tzimiropoulos, G., Martinez, B., De la Torre, F., & Valstar, M. (2021). A transfer learning approach to heatmap regression for action unit intensity estimation. *IEEE Transactions on Affective Computing*. https://doi.org/10.1109/TAFFC.2021.3061605
2. Kimani, E., Murali, P., Shamekhi, A., Parmar, D., Munikoti, S., & Bickmore, T. (2020). Multimodal assessment of oral presentations using HMMs. *ICMI 2020*. https://doi.org/10.1145/3382507.3418888
3. Dimitriadou, E., & Lanitis, A. (2024). An integrated framework for developing and evaluating a lecture style assessment methodology. *Multimedia Tools and Applications*. https://doi.org/10.1007/s11042-024-20297-6
4. Ochoa, X., & Domínguez, F. (2020). Controlled evaluation of a multimodal system to improve oral presentation skills in a real learning setting. *British Journal of Educational Technology, 51*(5), 1615–1630. https://doi.org/10.1111/bjet.12987
