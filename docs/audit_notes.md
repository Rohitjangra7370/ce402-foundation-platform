# Running notes for the AI audit (written during the session, not reconstructed afterwards)

Format: [time] what the AI produced -> how it was detected -> correction.  Only real events go here.

1. [13:5x JST] Claude's first draft of engine.js used `log10(...)` in sptCorrect, oedAnalyse,
   schmertmann, consolidationLayer without defining it (ReferenceError at run time).
   Detected: first run of tools/derive.js (the unit tests of the first batch did not call these functions).
   Correction: `const log10 = Math.log10;` added; tests extended to cover every exported function.
   Lesson: a passing test suite only proves the functions it calls.

2. [13:4x JST] Before writing code Claude recalled IS 6403 Ngamma as Meyerhof's (Nq-1)tan(1.4 phi)
   (15.7 at 30 deg). Checked against the code text (Public.Resource.Org copy of IS 6403:1981, Table 1):
   22.40 at 30 deg = Vesic 2(Nq+1)tan(phi). Not in shipped code; caught at the verification step.
   Same check showed Claude's recalled rectangle sq = 1.0 differs from the secondary-source table
   (sq = 1 + 0.2 B/L); the primary scan is illegible, so this is flagged as unverified in the report.

3. [14:0x JST] Claude's first draft of the P5 UI treated each clay layer as its own DOUBLE-drained layer in the
   time-settlement curve. At BH-1 and BH-3 the two clay layers are stacked (clay on clay), so the upper layer has no
   free-draining lower boundary; the drainage path would be halved wrongly and consolidation would look too fast.
   Detected: reading the code against the physical profile before accepting the first screenshot.
   Correction: contiguous clay layers are one stratum, cv(eq) = (sum H)^2 / (sum H/sqrt(cv))^2 (new engine function
   cvEquivalent, tested in tests/check.py); the user still chooses single/double drainage per stratum.

4. [14:0x JST] The UI's getProfile() passed NaN for a blank unit-weight box (parseFloat('') = NaN), but the engine's
   unitWeights() only guards null/''. Entering gamma-sat only would have silently produced NaN stresses.
   Detected: code review of the app/engine interface. Correction: blank -> undefined, so the engine falls back to the other
   unit weight; validation message if both are blank.

5. [14:0x JST] The drainage drop-down in the first draft reset to "double" every time the page re-rendered
   (the stored selection was read from a variable created after the re-render). Detected by reading the code; fixed with a
   persistent selection map; tests/ui_test.js now checks that the choice survives a re-render.

6. [14:1x JST] Sourcing weakness: IS 2131:1981 itself could not be fetched (site not reachable from the sandbox) - the SPT
   correction rests on a BIS revision draft and NPTEL notes; IS 6403 Table 2 (shape/depth/inclination factors) and the
   IS 1904 raft row were OCR-garbled and were read from a secondary source. Flagged as "unverified against primary text"
   in the report instead of being presented as checked.

7. [14:1x JST] Analysis limitation found when the raft results came out: the mandatory borehole zoning is a step function,
   so adjacent columns B5 (BH-1 zone) and B6 (BH-3 zone) get very different settlements and the flexible-raft angular
   distortion (1/265) is governed by that artificial jump. Reported as a conservative upper bound beside a rigid-raft bound
   (1/1600); the truth needs a soil-structure interaction analysis. Not hidden by picking the favourable number.
