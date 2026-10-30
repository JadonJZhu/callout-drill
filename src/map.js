// Draws a map as SVG markup and converts screen clicks to grid units.

function rects(room, className) {
  return room.rects
    .map(([x, y, w, h]) => `<rect class="${className}" x="${x}" y="${y}" width="${w}" height="${h}"/>`)
    .join('');
}

// Labels go at the centre of the room's largest rectangle.
function label(room) {
  const [x, y, w, h] = room.rects.reduce((a, b) => (b[2] * b[3] > a[2] * a[3] ? b : a));
  return `<text x="${x + w / 2}" y="${y + h / 2}">${room.name}</text>`;
}

// view: { labels: names to label or 'all', good: name lit green, marker: { x, y } of a wrong click }
export function mapMarkup(map, view = {}) {
  const { labels = [], good = null, marker = null } = view;
  const shapes = map.rooms.map((room) => {
    const lit = room.name === good ? 'good' : room.kind;
    // Outlines first, then fills on top: this hides the lines between a room's own rectangles.
    return `<g class="${lit}">${rects(room, 'edge')}${rects(room, 'fill')}</g>`;
  });
  const texts = map.rooms.filter((room) => labels === 'all' || labels.includes(room.name)).map(label);
  const cross = marker ? `<circle class="marker" cx="${marker.x}" cy="${marker.y}" r="1.2"/>` : '';
  return shapes.join('') + texts.join('') + cross;
}

export function toGrid(svg, event) {
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
  return { x: point.x, y: point.y };
}
