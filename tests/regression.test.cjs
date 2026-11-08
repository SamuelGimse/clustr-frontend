const assert = require('node:assert/strict');
const test = require('node:test');
const { fitRegressions } = require('../dashboard/regression.js');
const DAY = 86400000, START = Date.parse('2026-11-01T12:00:00Z');
const series = values => values.map((score, day) => ({ date: new Date(START + day * DAY).toISOString(), score }));
const close = (actual, expected, tolerance = 1e-7) => assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const model = (result, kind) => result.models.find(item => item.kind === kind).fit;

test('All four known curves are recovered and original-scale R² selects the best', () => {
  for (const [kind, fn] of [
    ['linear', x => -3 + .7 * x],
    ['polynomial', x => 2 - .5 * x + .12 * x * x],
    ['logarithmic', x => -4 + 3 * Math.log1p(x)],
    ['exponential', x => 1.5 * Math.exp(.16 * x)]
  ]) {
    const days = series(Array.from({ length: 9 }, (_, day) => fn(day)));
    const result = fitRegressions(days);
    assert.equal(result.best.kind, kind);
    close(result.best.r2, 1);
    for (const day of days) close(result.best.predict(Date.parse(day.date)), day.score, 1e-6);
    for (const candidate of result.models.filter(item => item.fit)) assert(candidate.fit.r2 <= result.best.r2 + 1e-9);
  }
});

test('Exponential least squares works on negative and mixed-sign impacts without dropping points', () => {
  const negative = series(Array.from({ length: 8 }, (_, day) => -1.5 * Math.exp(.16 * day)));
  const negativeFit = model(fitRegressions(negative), 'exponential');
  close(negativeFit.r2, 1); assert(negativeFit.predict(START) < 0);
  const days = series([-3, -.5, 0, 1, 1.5, 2.8, 3.2, 5]);
  const mean = days.reduce((sum, day) => sum + day.score, 0) / days.length;
  const total = days.reduce((sum, day) => sum + (day.score - mean) ** 2, 0);
  for (const candidate of fitRegressions(days).models.filter(item => item.fit)) {
    const rss = days.reduce((sum, day) => sum + (day.score - candidate.fit.predict(Date.parse(day.date))) ** 2, 0);
    close(candidate.fit.r2, 1 - rss / total);
    assert.equal(candidate.fit.count, days.length);
  }
});

test('95% linear mean-response intervals use Student t and residual n−2 degrees of freedom', () => {
  const values = [1, 2.2, 2.8, 4.1, 5.2], fit = model(fitRegressions(series(values)), 'linear');
  const mean = values.reduce((sum, y) => sum + y, 0) / 5;
  const slope = values.reduce((sum, y, x) => sum + (x - 2) * (y - mean), 0) / 10;
  const rss = values.reduce((sum, y, x) => sum + (y - mean - slope * (x - 2)) ** 2, 0);
  const middle = fit.confidence(START + 2 * DAY), edge = fit.confidence(START);
  close(middle.value, mean);
  close(middle.upper - middle.value, 3.182446305 * Math.sqrt(rss / 3 / 5));
  close(edge.upper - edge.value, 3.182446305 * Math.sqrt(rss / 3 * (.2 + 4 / 10)));
  assert.equal(fit.df, 3);
  assert(edge.upper - edge.lower > middle.upper - middle.lower);
});

test('Quadratic confidence uses n−3 degrees of freedom and the full covariance matrix', () => {
  const values = [4.1, 1, .2, 1.2, 3.9], xs = [-2, -1, 0, 1, 2];
  const sum = values.reduce((a, b) => a + b, 0);
  const sumXY = values.reduce((s, y, i) => s + xs[i] * y, 0);
  const sumX2Y = values.reduce((s, y, i) => s + xs[i] ** 2 * y, 0);
  const a = (34 * sum - 10 * sumX2Y) / 70, b = sumXY / 10, c = (-10 * sum + 5 * sumX2Y) / 70;
  const rss = values.reduce((s, y, i) => s + (y - a - b * xs[i] - c * xs[i] ** 2) ** 2, 0);
  const fit = model(fitRegressions(series(values)), 'polynomial'), middle = fit.confidence(START + 2 * DAY);
  assert.equal(fit.df, 2); close(middle.value, a);
  close(middle.upper - middle.value, 4.302652730 * Math.sqrt(rss / 2 * 34 / 70));
});

test('Missing values stay absent, zero is retained, and sparse or singular data is not overfit', () => {
  const days = series([null, -2, 0, null, 4]);
  const result = fitRegressions(days);
  assert.equal(result.points.length, 3); assert(result.points.some(point => point.score === 0));
  assert.equal(model(result, 'polynomial'), null);
  assert.equal(fitRegressions(days.slice(0, 3)).best, null);
  assert.equal(fitRegressions(days.map(day => ({ ...day, date: '2026-11-01' }))).best, null);
  const flat = fitRegressions(series([0, 0, 0, 0, 0]));
  assert.equal(flat.best.kind, 'linear'); close(flat.best.r2, 1);
  assert(flat.best.samples.every(point => point.value === 0 && point.lower === 0 && point.upper === 0));
});
