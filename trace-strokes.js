(() => {
  'use strict';

  // Standard U.S. school manuscript stroke definitions (0..100 x 0..100, midline=50, baseline=100, descender=130).
  // Segment primitives:
  //   ['L', x1, y1, x2, y2]
  //   ['Q', x1, y1, cx, cy, x2, y2]
  //   ['C', x1, y1, cx1, cy1, cx2, cy2, x2, y2]
  //   ['A', cx, cy, rx, ry, startDeg, endDeg, ccw]
  //   ['DOT', cx, cy]

  const STROKES = {
    // Uppercase A-Z
    A: [
      [['L', 50, 2, 16, 100]],
      [['L', 50, 2, 84, 100]],
      [['L', 27, 66, 73, 66]]
    ],
    B: [
      [['L', 24, 0, 24, 100]],
      [['L', 24, 0, 52, 0], ['A', 52, 24, 24, 24, -90, 90, false], ['L', 52, 48, 24, 48]],
      [['L', 24, 48, 56, 48], ['A', 56, 74, 26, 26, -90, 90, false], ['L', 56, 100, 24, 100]]
    ],
    C: [
      [['A', 54, 50, 36, 50, -40, 40, true]]
    ],
    D: [
      [['L', 22, 0, 22, 100]],
      [['L', 22, 0, 46, 0], ['A', 46, 50, 38, 50, -90, 90, false], ['L', 46, 100, 22, 100]]
    ],
    E: [
      [['L', 24, 0, 24, 100]],
      [['L', 24, 0, 78, 0]],
      [['L', 24, 50, 68, 50]],
      [['L', 24, 100, 78, 100]]
    ],
    F: [
      [['L', 26, 0, 26, 100]],
      [['L', 26, 0, 78, 0]],
      [['L', 26, 50, 68, 50]]
    ],
    G: [
      [['A', 52, 50, 36, 50, -40, 12, true]],
      [['L', 86, 56, 54, 56]]
    ],
    H: [
      [['L', 22, 0, 22, 100]],
      [['L', 78, 0, 78, 100]],
      [['L', 22, 50, 78, 50]]
    ],
    I: [
      [['L', 50, 0, 50, 100]],
      [['L', 26, 0, 74, 0]],
      [['L', 26, 100, 74, 100]]
    ],
    J: [
      [['L', 64, 0, 64, 72], ['A', 42, 72, 22, 28, 0, 175, false]],
      [['L', 36, 0, 82, 0]]
    ],
    K: [
      [['L', 24, 0, 24, 100]],
      [['L', 78, 0, 24, 54]],
      [['L', 42, 38, 80, 100]]
    ],
    L: [
      [['L', 26, 0, 26, 100]],
      [['L', 26, 100, 78, 100]]
    ],
    M: [
      [['L', 14, 0, 14, 100]],
      [['L', 14, 0, 50, 72]],
      [['L', 86, 0, 50, 72]],
      [['L', 86, 0, 86, 100]]
    ],
    N: [
      [['L', 22, 0, 22, 100]],
      [['L', 22, 0, 78, 100]],
      [['L', 78, 0, 78, 100]]
    ],
    O: [
      [['A', 50, 50, 36, 50, -90, 270, true]]
    ],
    P: [
      [['L', 26, 0, 26, 100]],
      [['L', 26, 0, 54, 0], ['A', 54, 26, 26, 26, -90, 90, false], ['L', 54, 52, 26, 52]]
    ],
    Q: [
      [['A', 50, 50, 36, 50, -90, 270, true]],
      [['L', 58, 74, 86, 102]]
    ],
    R: [
      [['L', 24, 0, 24, 100]],
      [['L', 24, 0, 54, 0], ['A', 54, 26, 26, 26, -90, 90, false], ['L', 54, 52, 24, 52]],
      [['L', 50, 52, 80, 100]]
    ],
    S: [
      [['A', 50, 25, 28, 25, -25, 90, true], ['A', 50, 75, 30, 25, -90, 155, false]]
    ],
    T: [
      [['L', 50, 0, 50, 100]],
      [['L', 16, 0, 84, 0]]
    ],
    U: [
      [['L', 20, 0, 20, 66], ['A', 50, 66, 30, 34, 180, 0, true], ['L', 80, 66, 80, 0]]
    ],
    V: [
      [['L', 18, 0, 50, 100]],
      [['L', 82, 0, 50, 100]]
    ],
    W: [
      [['L', 10, 0, 28, 100]],
      [['L', 28, 100, 50, 34]],
      [['L', 50, 34, 72, 100]],
      [['L', 72, 100, 90, 0]]
    ],
    X: [
      [['L', 20, 0, 80, 100]],
      [['L', 80, 0, 20, 100]]
    ],
    Y: [
      [['L', 18, 0, 50, 50]],
      [['L', 82, 0, 50, 50]],
      [['L', 50, 50, 50, 100]]
    ],
    Z: [
      [['L', 20, 0, 80, 0]],
      [['L', 80, 0, 20, 100]],
      [['L', 20, 100, 80, 100]]
    ],

    // Lowercase a-z
    a: [
      [['A', 46, 75, 26, 25, -45, 315, true]],
      [['L', 72, 50, 72, 100]]
    ],
    b: [
      [['L', 26, 0, 26, 100]],
      [['A', 52, 75, 26, 25, -160, 160, false]]
    ],
    c: [
      [['A', 54, 75, 26, 25, -40, 40, true]]
    ],
    d: [
      [['A', 46, 75, 26, 25, -45, 315, true]],
      [['L', 72, 0, 72, 100]]
    ],
    e: [
      [['L', 24, 75, 76, 75], ['A', 50, 75, 26, 25, 0, 42, true]]
    ],
    f: [
      [['A', 58, 20, 18, 20, -20, 180, true], ['L', 40, 20, 40, 100]],
      [['L', 22, 50, 64, 50]]
    ],
    g: [
      [['A', 46, 75, 26, 25, -45, 315, true]],
      [['L', 72, 50, 72, 108], ['A', 48, 108, 24, 22, 0, 160, false]]
    ],
    h: [
      [['L', 26, 0, 26, 100]],
      [['A', 50, 72, 24, 22, 180, 0, false], ['L', 74, 72, 74, 100]]
    ],
    i: [
      [['L', 50, 50, 50, 100]],
      [['DOT', 50, 30]]
    ],
    j: [
      [['L', 56, 50, 56, 108], ['A', 36, 108, 20, 22, 0, 165, false]],
      [['DOT', 56, 30]]
    ],
    k: [
      [['L', 26, 0, 26, 100]],
      [['L', 72, 50, 26, 78]],
      [['L', 42, 68, 74, 100]]
    ],
    l: [
      [['L', 50, 0, 50, 100]]
    ],
    m: [
      [['L', 14, 50, 14, 100]],
      [['A', 32, 70, 18, 20, 180, 0, false], ['L', 50, 70, 50, 100]],
      [['A', 68, 70, 18, 20, 180, 0, false], ['L', 86, 70, 86, 100]]
    ],
    n: [
      [['L', 26, 50, 26, 100]],
      [['A', 50, 72, 24, 22, 180, 0, false], ['L', 74, 72, 74, 100]]
    ],
    o: [
      [['A', 50, 75, 26, 25, -90, 270, true]]
    ],
    p: [
      [['L', 26, 50, 26, 130]],
      [['A', 52, 75, 26, 25, -160, 160, false]]
    ],
    q: [
      [['A', 46, 75, 26, 25, -45, 315, true]],
      [['L', 72, 50, 72, 130]]
    ],
    r: [
      [['L', 34, 50, 34, 100]],
      [['A', 54, 72, 20, 22, 180, -45, false]]
    ],
    s: [
      [['A', 50, 62, 20, 12, -25, 90, true], ['A', 50, 88, 22, 12, -90, 155, false]]
    ],
    t: [
      [['L', 50, 14, 50, 100]],
      [['L', 28, 50, 72, 50]]
    ],
    u: [
      [['L', 26, 50, 26, 78], ['A', 50, 78, 24, 22, 180, 0, true], ['L', 74, 78, 74, 50]],
      [['L', 74, 50, 74, 100]]
    ],
    v: [
      [['L', 24, 50, 50, 100]],
      [['L', 76, 50, 50, 100]]
    ],
    w: [
      [['L', 14, 50, 30, 100]],
      [['L', 30, 100, 50, 62]],
      [['L', 50, 62, 70, 100]],
      [['L', 70, 100, 86, 50]]
    ],
    x: [
      [['L', 26, 50, 74, 100]],
      [['L', 74, 50, 26, 100]]
    ],
    y: [
      [['L', 26, 50, 50, 100]],
      [['L', 74, 50, 32, 130]]
    ],
    z: [
      [['L', 26, 50, 74, 50]],
      [['L', 74, 50, 26, 100]],
      [['L', 26, 100, 74, 100]]
    ],

    // Numbers 0-9
    '0': [
      [['A', 50, 50, 32, 50, -90, 270, true]]
    ],
    '1': [
      [['L', 50, 0, 50, 100]]
    ],
    '2': [
      [['A', 50, 26, 28, 26, 195, 25, false], ['L', 75, 37, 22, 100]],
      [['L', 22, 100, 80, 100]]
    ],
    '3': [
      [['A', 48, 25, 26, 25, 200, 90, false], ['A', 48, 75, 28, 25, -90, 160, false]]
    ],
    '4': [
      [['L', 30, 0, 30, 56], ['L', 30, 56, 76, 56]],
      [['L', 64, 0, 64, 100]]
    ],
    '5': [
      [['L', 30, 0, 30, 48], ['A', 52, 72, 28, 28, 212, 152, false]],
      [['L', 30, 0, 76, 0]]
    ],
    '6': [
      [['A', 52, 50, 30, 50, -55, 180, true], ['A', 50, 72, 28, 28, 180, -180, true]]
    ],
    '7': [
      [['L', 22, 0, 78, 0], ['L', 78, 0, 38, 100]]
    ],
    '8': [
      [['A', 50, 24, 24, 24, -45, 90, true], ['A', 50, 74, 28, 26, -90, 270, false], ['A', 50, 24, 24, 24, 90, -45, true]]
    ],
    '9': [
      [['A', 48, 28, 26, 28, -25, 335, true]],
      [['L', 74, 28, 74, 100]]
    ]
  };

  function degToRad(deg) {
    return deg * Math.PI / 180;
  }

  function arcAngles(startDeg, endDeg, ccw) {
    const a1 = degToRad(startDeg);
    let a2 = degToRad(endDeg);
    if (ccw) {
      while (a2 >= a1 - 1e-4) a2 -= Math.PI * 2;
    } else {
      while (a2 <= a1 + 1e-4) a2 += Math.PI * 2;
    }
    return [a1, a2];
  }

  function sampleSegment(seg, steps = 28) {
    const type = seg[0];
    if (type === 'DOT') return [{ x: seg[1], y: seg[2], dot: true }];
    const pts = [];
    if (type === 'L') {
      const [, x1, y1, x2, y2] = seg;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        pts.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
      }
    } else if (type === 'Q') {
      const [, x1, y1, cx, cy, x2, y2] = seg;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        pts.push({
          x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
          y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2
        });
      }
    } else if (type === 'C') {
      const [, x1, y1, cx1, cy1, cx2, cy2, x2, y2] = seg;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        pts.push({
          x: mt * mt * mt * x1 + 3 * mt * mt * t * cx1 + 3 * mt * t * t * cx2 + t * t * t * x2,
          y: mt * mt * mt * y1 + 3 * mt * mt * t * cy1 + 3 * mt * t * t * cy2 + t * t * t * y2
        });
      }
    } else if (type === 'A') {
      const [, cx, cy, rx, ry, startDeg, endDeg, ccw] = seg;
      const [a1, a2] = arcAngles(startDeg, endDeg, ccw);
      const n = Math.max(18, Math.round(Math.abs(a2 - a1) / Math.PI * 28));
      for (let i = 0; i <= n; i++) {
        const a = a1 + (a2 - a1) * (i / n);
        pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
      }
    }
    return pts;
  }

  function sampleStroke(stroke) {
    const all = [];
    stroke.forEach((seg, idx) => {
      const pts = sampleSegment(seg);
      if (idx > 0 && pts.length > 0) pts.shift();
      all.push(...pts);
    });
    return all;
  }

  function strokeLength(pts) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return total;
  }

  function pointAlongStroke(pts, targetDist) {
    if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, angle: 0 };
    let walked = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      const segLen = Math.hypot(dx, dy);
      if (walked + segLen >= targetDist || i === pts.length - 1) {
        const local = segLen > 0 ? Math.max(0, Math.min(1, (targetDist - walked) / segLen)) : 0;
        return {
          x: pts[i - 1].x + dx * local,
          y: pts[i - 1].y + dy * local,
          angle: Math.atan2(dy, dx)
        };
      }
      walked += segLen;
    }
    const last = pts[pts.length - 1];
    return { x: last.x, y: last.y, angle: 0 };
  }

  function drawTraceGlyph(ctx, char, bounds, options = {}) {
    const strokes = STROKES[char];
    if (!strokes) return;
    const {
      showArrows = true,
      showNumbers = true,
      showStartDots = true
    } = options;

    // bounds: { x, y, size } where size maps 0..100 (sky to baseline)
    const scale = bounds.size / 100;
    const tx = gx => bounds.x + gx * scale;
    const ty = gy => bounds.y + gy * scale;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const sampledStrokes = strokes.map(sampleStroke);

    // 1. Wide soft tracing track
    sampledStrokes.forEach(pts => {
      if (pts.length === 1 && pts[0].dot) {
        ctx.beginPath();
        ctx.arc(tx(pts[0].x), ty(pts[0].y), Math.max(8, 9 * scale), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(69, 130, 214, .18)';
        ctx.fill();
        return;
      }
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(tx(p.x), ty(p.y)) : ctx.lineTo(tx(p.x), ty(p.y))));
      ctx.lineWidth = Math.max(14, 15 * scale);
      ctx.strokeStyle = 'rgba(69, 130, 214, .14)';
      ctx.stroke();
    });

    // 2. Crisp dashed center guide line
    sampledStrokes.forEach(pts => {
      if (pts.length === 1 && pts[0].dot) {
        ctx.beginPath();
        ctx.arc(tx(pts[0].x), ty(pts[0].y), Math.max(5, 5.5 * scale), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(52, 120, 214, .62)';
        ctx.fill();
        return;
      }
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(tx(p.x), ty(p.y)) : ctx.lineTo(tx(p.x), ty(p.y))));
      ctx.lineWidth = Math.max(3.5, 3.6 * scale);
      ctx.setLineDash([Math.max(6, 5.5 * scale), Math.max(7, 6.5 * scale)]);
      ctx.strokeStyle = 'rgba(42, 108, 206, .78)';
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // 3. Directional arrows showing how each stroke should be drawn
    if (showArrows) {
      sampledStrokes.forEach(pts => {
        if (pts.length < 2) return;
        const total = strokeLength(pts);
        if (total < 14) return;
        const startDist = Math.min(total * 0.22, 22);
        const endDist = Math.min(total * 0.62, startDist + 32);
        if (endDist - startDist < 8) return;

        // Sample short arrow path along the stroke
        const arrowPts = [];
        const steps = 10;
        for (let i = 0; i <= steps; i++) {
          const d = startDist + (endDist - startDist) * (i / steps);
          arrowPts.push(pointAlongStroke(pts, d));
        }

        ctx.beginPath();
        arrowPts.forEach((p, i) => (i === 0 ? ctx.moveTo(tx(p.x), ty(p.y)) : ctx.lineTo(tx(p.x), ty(p.y))));
        ctx.lineWidth = Math.max(3.2, 3.2 * scale);
        ctx.strokeStyle = '#ef6c2f';
        ctx.stroke();

        // Crisp arrowhead at end of arrow path
        const tip = arrowPts[arrowPts.length - 1];
        const headLen = Math.max(9, 8.5 * scale);
        const angle = tip.angle;
        const tipX = tx(tip.x);
        const tipY = ty(tip.y);
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - headLen * Math.cos(angle - 0.55), tipY - headLen * Math.sin(angle - 0.55));
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - headLen * Math.cos(angle + 0.55), tipY - headLen * Math.sin(angle + 0.55));
        ctx.lineWidth = Math.max(3.2, 3.2 * scale);
        ctx.strokeStyle = '#ef6c2f';
        ctx.stroke();
      });
    }

    // 4. Numbered green start badges (or clean green start dots on repetition boxes)
    if (showStartDots) {
      const placedBadges = [];
      sampledStrokes.forEach((pts, index) => {
        const start = pts[0];
        let bx = tx(start.x);
        let by = ty(start.y);

        // If another badge is right at the same start point (e.g. A, M, N), nudge along stroke direction
        const overlaps = placedBadges.some(p => Math.hypot(p.x - bx, p.y - by) < 18);
        if (overlaps && pts.length > 1) {
          const nudged = pointAlongStroke(pts, 14);
          bx = tx(nudged.x);
          by = ty(nudged.y);
        }
        placedBadges.push({ x: bx, y: by });

        const radius = showNumbers ? Math.max(10, 8.5 * scale) : Math.max(6, 5 * scale);
        ctx.beginPath();
        ctx.arc(bx, by, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#29a35b';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        if (showNumbers) {
          ctx.fillStyle = '#ffffff';
          ctx.font = `800 ${Math.round(radius * 1.25)}px "Segoe UI", system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(index + 1), bx, by + 0.5);
        }
      });
    }

    ctx.restore();
  }

  window.TRACE_STROKES = { STROKES, drawTraceGlyph };
})();
