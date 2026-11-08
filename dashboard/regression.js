(function (root, factory) {
  const regression = factory();
  if (typeof module === 'object' && module.exports) module.exports = regression;
  else root.ClustrRegression = regression;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Dashboard windows contain at most 14 report days: residual df is 1–12.
  // Two-sided t(.975, df): https://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm
  const T95 = [null, 12.706204736, 4.302652730, 3.182446305, 2.776445105, 2.570581836,
    2.446911851, 2.364624252, 2.306004135, 2.262157163, 2.228138852, 2.200985160, 2.178812830];
  const TYPES = [['linear', 'Linear', 2], ['logarithmic', 'Logarithmic', 2], ['exponential', 'Exponential', 2]];

  function inverse(matrix) {
    const n = matrix.length;
    const rows = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => Number(i === j))]);
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let row = col + 1; row < n; row++) if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
      if (Math.abs(rows[pivot][col]) < 1e-12) return null;
      [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
      const scale = rows[col][col];
      rows[col] = rows[col].map(value => value / scale);
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = rows[row][col];
        rows[row] = rows[row].map((value, j) => value - factor * rows[col][j]);
      }
    }
    const result = rows.map(row => row.slice(n));
    return result.every(row => row.every(Number.isFinite)) ? result : null;
  }

  function gram(rows) {
    return rows[0].map((_, i) => rows[0].map((_, j) => rows.reduce((sum, row) => sum + row[i] * row[j], 0)));
  }

  function finish(kind, label, points, parameterCount, predict, gradient) {
    const df = points.length - parameterCount;
    if (df < 1) return null;
    const covarianceBase = inverse(gram(points.map(point => gradient(point.time))));
    if (!covarianceBase) return null;
    const residual = points.reduce((sum, point) => sum + (point.score - predict(point.time)) ** 2, 0);
    const mean = points.reduce((sum, point) => sum + point.score, 0) / points.length;
    const total = points.reduce((sum, point) => sum + (point.score - mean) ** 2, 0);
    const r2 = total < 1e-20 ? (residual < 1e-20 ? 1 : 0) : 1 - residual / total;
    if (!Number.isFinite(r2)) return null;
    const interval = (time, futureObservation = false) => {
      const vector = gradient(time);
      const leverage = vector.reduce((sum, a, i) => sum + vector.reduce((inner, b, j) => inner + a * covarianceBase[i][j] * b, 0), 0);
      // A future observation includes residual noise as well as fitted-mean uncertainty.
      const margin = T95[df] * Math.sqrt(Math.max(0, residual / df * (leverage + Number(futureObservation))));
      const value = predict(time);
      return { value, lower: value - margin, upper: value + margin };
    };
    const confidence = time => interval(time);
    const prediction = time => interval(time, true);
    const firstTime = points[0].time, lastTime = points.at(-1).time;
    const samples = Array.from({ length: 81 }, (_, i) => {
      const time = firstTime + (lastTime - firstTime) * i / 80;
      return { time, ...confidence(time) };
    });
    if (samples.some(sample => ![sample.value, sample.lower, sample.upper].every(Number.isFinite))) return null;
    return { kind, label, count: points.length, parameterCount, df, r2: Math.min(1, r2), residual, predict, confidence, prediction, samples };
  }

  function fitBasis(kind, label, points, basis) {
    const design = points.map(point => basis(point.time));
    const p = design[0].length;
    if (points.length <= p) return null;
    const inv = inverse(gram(design));
    if (!inv) return null;
    const target = design[0].map((_, i) => points.reduce((sum, point, row) => sum + design[row][i] * point.score, 0));
    const coefficients = inv.map(row => row.reduce((sum, value, i) => sum + value * target[i], 0));
    const predict = time => basis(time).reduce((sum, value, i) => sum + value * coefficients[i], 0);
    return finish(kind, label, points, p, predict, basis);
  }

  function fitExponential(points, start, span) {
    if (points.length < 3) return null;
    // Profile nonlinear least squares on ORIGINAL signed scores, not log(y).
    // The amplitude can be negative; every candidate uses the same observations.
    const u = time => (time - start) / span - .5;
    const profile = rate => {
      const values = points.map(point => Math.exp(rate * u(point.time)));
      const amplitude = values.reduce((sum, value, i) => sum + value * points[i].score, 0) / values.reduce((sum, value) => sum + value * value, 0);
      return { rate, amplitude, error: values.reduce((sum, value, i) => sum + (points[i].score - amplitude * value) ** 2, 0) };
    };
    let best = profile(0);
    for (let rate = -40; rate <= 40; rate++) {
      const candidate = profile(rate);
      if (candidate.error < best.error) best = candidate;
    }
    let low = Math.max(-40, best.rate - 1), high = Math.min(40, best.rate + 1);
    const ratio = (Math.sqrt(5) - 1) / 2;
    let left = profile(high - ratio * (high - low)), right = profile(low + ratio * (high - low));
    for (let i = 0; i < 90; i++) {
      if (left.error < right.error) {
        high = right.rate; right = left; left = profile(high - ratio * (high - low));
      } else {
        low = left.rate; left = right; right = profile(low + ratio * (high - low));
      }
    }
    for (const candidate of [left, right]) if (candidate.error < best.error) best = candidate;
    // Boundary solutions do not establish a reliable finite optimum or CI.
    if (Math.abs(best.rate) > 39.99) return null;
    const predict = time => best.amplitude * Math.exp(best.rate * u(time));
    const gradient = time => [Math.exp(best.rate * u(time)), predict(time) * u(time)];
    return finish('exponential', 'Exponential', points, 2, predict, gradient);
  }

  function fitRegressions(days) {
    const points = days.filter(day => day.score != null && Number.isFinite(day.score) && Number.isFinite(Date.parse(day.date)))
      .map(day => ({ time: Date.parse(day.date), score: day.score }))
      .sort((a, b) => a.time - b.time).slice(-14);
    const start = points[0]?.time, span = (points.at(-1)?.time - start) || 1;
    const centered = time => 2 * (time - start) / span - 1;
    const fits = points.length < 3 ? [] : [
      fitBasis('linear', 'Linear', points, time => [1, centered(time)]),
      fitBasis('logarithmic', 'Logarithmic', points, time => [1, Math.log1p((time - start) / 86400000)]),
      fitExponential(points, start, span)
    ].filter(Boolean);
    // Highest original-scale R² wins. Numerically tied fits prefer fewer parameters.
    const best = fits.reduce((winner, fit) => !winner || fit.r2 > winner.r2 + 1e-9 || (Math.abs(fit.r2 - winner.r2) <= 1e-9 && fit.parameterCount < winner.parameterCount) ? fit : winner, null);
    return { best, models: TYPES.map(([kind, label, parameters]) => ({ kind, label, fit: fits.find(fit => fit.kind === kind) || null, required: parameters + 1 })), points };
  }

  function projectOneDay(fit, latestReportDate) {
    const reportTime = Date.parse(latestReportDate), endTime = reportTime + 86400000;
    if (!fit || !Number.isFinite(reportTime) || reportTime < fit.samples.at(-1).time) return null;
    const curve = Array.from({ length: 25 }, (_, i) => {
      const time = fit.samples.at(-1).time + (endTime - fit.samples.at(-1).time) * i / 24;
      return { time, value: fit.predict(time) };
    });
    const band = Array.from({ length: 17 }, (_, i) => {
      const time = reportTime + 86400000 * i / 16;
      return { time, ...fit.prediction(time) };
    });
    if (curve.some(point => !Number.isFinite(point.value)) || band.some(point => ![point.value, point.lower, point.upper].every(Number.isFinite))) return null;
    return { reportTime, curve, band, point: band.at(-1) };
  }

  return { fitRegressions, projectOneDay };
});
