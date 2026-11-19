// Fixed scenes for screenshots: ?shot=editor shows the app with a sample photo
// loaded; ?shot=cover shows the exported cover alone, full-frame.
// Query params: photo (pier | boulevard | skyline), title, subtitle, layout,
// grade, size (square | portrait | wide). window.__shotReady is set by main.js.
export async function runShot(shot, query, app) {
  const photo = query.get('photo') ?? 'pier';
  const title = query.get('title') ?? query.get('caption') ?? 'Sunset Heist';
  const subtitle = query.get('subtitle') ?? 'Vice City Nights';
  const layout = query.get('layout') ?? 'grid4';
  const grade = query.get('grade') ?? 'sunset';
  const size = query.get('size') ?? 'square';
  app.setTitle(title);
  app.setSubtitle(subtitle);
  app.setLayout(layout);
  app.setGrade(grade);
  app.setSize(size);
  if (photo === 'skyline') {
    app.state.panels.forEach((p) => { p.photoId = 'skyline'; });
  } else {
    // Mix the chosen photo with the other sample and the drawn skyline so
    // multi-panel layouts show variety instead of one photo four times.
    const other = photo === 'pier' ? 'boulevard' : 'pier';
    const cycle = [photo, other, 'skyline', photo, other, 'skyline', photo, other, 'skyline'];
    app.state.panels.forEach((p, i) => {
      p.photoId = cycle[i];
      p.zoom = 1;
      p.ox = 0;
      p.oy = 0;
      p.rot = 0;
    });
  }
  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    // Full-frame cover: stretch the preview canvas to the viewport.
    const canvas = document.getElementById('preview');
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
  }
  app.redraw();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
