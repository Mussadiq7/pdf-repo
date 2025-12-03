// app.js — fixed: multiple pages + margins + orientation + robust image fit/rotation
// Assumes Sortable and jsPDF (UMD) are loaded before this script.

const state = { images: [] };
const uid = () => Math.random().toString(36).slice(2,9);

// DOM refs
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const thumbsWrap = document.getElementById('thumbsWrap');
const generateBtn = document.getElementById('generateBtn');
const clearBtn = document.getElementById('clearBtn');
const status = document.getElementById('status');
const pageSizeSel = document.getElementById('pageSize');
const customSizeRow = document.getElementById('customSizeRow');
const customWidth = document.getElementById('customWidth');
const customHeight = document.getElementById('customHeight');

// jsPDF (UMD)
const { jsPDF } = window.jspdf || { jsPDF: null };

// Minimal checks
if (!jsPDF) {
  console.error('jsPDF not found. Ensure script tag for jsPDF is loaded before app.js');
  if (status) status.textContent = 'Error: jsPDF not loaded.';
}

// Drag & drop wiring
dropArea.addEventListener('click', () => fileInput.click());
['dragenter','dragover'].forEach(ev => {
  dropArea.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); dropArea.classList.add('drag-over'); });
});
['dragleave','drop'].forEach(ev => {
  dropArea.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); dropArea.classList.remove('drag-over'); });
});
dropArea.addEventListener('drop', (e) => {
  const files = Array.from(e.dataTransfer.files || []);
  handleFiles(files);
});
fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  handleFiles(files);
  fileInput.value = '';
});

// Load files
async function handleFiles(files) {
  if (!files.length) return;
  status.textContent = `Loading ${files.length} file(s)...`;
  for (const f of files) {
    if (!f.type || !f.type.startsWith('image/')) {
      // fallback by extension
      const ext = (f.name || '').split('.').pop()?.toLowerCase();
      const allowedExt = ['jpg','jpeg','png','webp','gif','bmp'];
      if (!allowedExt.includes(ext)) {
        console.warn('Skipping non-image:', f.name, f.type);
        continue;
      }
    }
    try { await addImageFile(f); }
    catch (err) { console.warn('Failed to load image', f.name, err); }
  }
  status.textContent = `${state.images.length} image(s) ready.`;
  renderThumbs();
}

function addImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        state.images.push({
          id: uid(),
          file,
          url: ev.target.result,
          rotation: 0,
          width: img.width,
          height: img.height
        });
        resolve();
      };
      img.onerror = (e) => reject(new Error('Image decode failed'));
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Thumbnails + reorder
function renderThumbs() {
  thumbsWrap.innerHTML = '';
  for (const img of state.images) {
    const card = document.createElement('div');
    card.className = 'bg-gray-50 border rounded p-2 flex flex-col items-center gap-2';
    card.dataset.id = img.id;
    card.innerHTML = `
      <div class="w-full h-36 bg-white rounded overflow-hidden flex items-center justify-center">
        <img src="${img.url}" alt="" class="thumb-img" style="max-width:100%; max-height:100%; transform: rotate(${img.rotation}deg);">
      </div>
      <div class="w-full flex justify-between items-center gap-2">
        <div class="text-xs text-gray-600 truncate" title="${escapeHtml(img.file.name)}">${escapeHtml(img.file.name)}</div>
        <div class="flex gap-1">
          <button data-action="rotate-left" title="Rotate left" class="px-2 py-1 text-xs border rounded">⟲</button>
          <button data-action="rotate-right" title="Rotate right" class="px-2 py-1 text-xs border rounded">⟳</button>
          <button data-action="remove" title="Remove" class="px-2 py-1 text-xs border rounded text-red-600">✕</button>
        </div>
      </div>
    `;
    thumbsWrap.appendChild(card);

    card.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'rotate-left') img.rotation = (img.rotation - 90) % 360;
        if (action === 'rotate-right') img.rotation = (img.rotation + 90) % 360;
        if (action === 'remove') {
          const idx = state.images.findIndex(it => it.id === img.id);
          if (idx !== -1) state.images.splice(idx,1);
        }
        renderThumbs();
        status.textContent = `${state.images.length} image(s) ready.`;
      });
    });
  }

  // sortable
  if (typeof Sortable !== 'undefined') {
    try { if (thumbsWrap._sortable) thumbsWrap._sortable.destroy(); } catch {}
    thumbsWrap._sortable = Sortable.create(thumbsWrap, {
      animation: 150,
      onEnd: () => {
        const ids = Array.from(thumbsWrap.children).map(c => c.dataset.id);
        state.images = ids.map(id => state.images.find(it => it.id === id)).filter(Boolean);
      }
    });
  }
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Presets
const PRESETS = { a4:{w:210,h:297}, letter:{w:216,h:279} };
pageSizeSel.addEventListener('change', () => pageSizeSel.value === 'custom' ? customSizeRow.classList.remove('hidden') : customSizeRow.classList.add('hidden'));

// Generate PDF — FIXED: create/switch page BEFORE adding image, handle orientation and margins
generateBtn.addEventListener('click', async () => {
  if (!state.images.length) { status.textContent = 'No images — add some first.'; return; }
  if (!jsPDF) { status.textContent = 'Error: jsPDF not loaded.'; return; }

  // settings
  const sizeKey = pageSizeSel.value;
  let pageWmm = PRESETS[sizeKey]?.w;
  let pageHmm = PRESETS[sizeKey]?.h;
  if (sizeKey === 'custom') {
    pageWmm = parseFloat(customWidth.value) || 210;
    pageHmm = parseFloat(customHeight.value) || 297;
  }
  const orientation = document.querySelector('input[name="orientation"]:checked').value; // 'portrait'|'landscape'
  const fit = document.querySelector('input[name="fit"]:checked').value; // 'contain'|'cover'
  const margin = Math.max(0, parseFloat(document.getElementById('margin').value || 10));
  const addPageNumbers = document.getElementById('addPageNumbers').checked;

  status.textContent = 'Building PDF...';
  generateBtn.disabled = true;

  try {
    // jsPDF expects format in mm. We'll create document with default first page and then explicitly add pages for each image.
    // To avoid orientation surprises, always pass explicit [width,height] when adding pages.
    // Create initial doc with the chosen orientation and size (we'll overwrite page content per-page).
    const doc = new jsPDF({ unit: 'mm', format: [pageWmm, pageHmm], orientation });

    for (let i = 0; i < state.images.length; i++) {
      const imgItem = state.images[i];
      status.textContent = `Processing ${i+1}/${state.images.length}...`;

      // For page 0 we are already on first page; for others create new page and set it as current.
      if (i > 0) {
        doc.addPage([pageWmm, pageHmm], orientation);
        doc.setPage(i + 1);
      } else {
        doc.setPage(1);
      }

      // draw image into a canvas sized to inner area (accounting for margins)
      await drawImageToPdfPage(doc, imgItem, {
        pageWmm, pageHmm, margin, fit, orientation
      });
    }

    // optional: page numbers
    if (addPageNumbers) {
      const pages = doc.getNumberOfPages();
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setFontSize(10);
        doc.setTextColor(120);
        const txt = `Page ${p} / ${pages}`;
        doc.text(txt, pageWmm / 2, pageHmm - 8, { align: 'center' });
      }
    }

    const filename = `images-to-pdf_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.pdf`;
    doc.save(filename);
    status.textContent = `PDF generated: ${filename}`;
  } catch (err) {
    console.error(err);
    status.textContent = 'Error: ' + (err.message || err);
  } finally {
    generateBtn.disabled = false;
  }
});

// drawImageToPdfPage: draws rotated + fitted image into a canvas sized to inner area, then adds to doc at (margin, margin)
async function drawImageToPdfPage(doc, imgItem, opts) {
  // decode image
  const img = new Image();
  img.src = imgItem.url;
  await img.decode();

  // compute page inner sizes (mm)
  const innerWmm = Math.max(1, opts.pageWmm - 2 * opts.margin);
  const innerHmm = Math.max(1, opts.pageHmm - 2 * opts.margin);

  // convert mm -> px for canvas. baseline 96 DPI (1 mm = 96/25.4 px)
  const pxPerMm = 96 / 25.4;
  const innerPxW = Math.round(innerWmm * pxPerMm);
  const innerPxH = Math.round(innerHmm * pxPerMm);

  // create canvas sized to inner area
  const canvas = document.createElement('canvas');
  canvas.width = innerPxW;
  canvas.height = innerPxH;
  const ctx = canvas.getContext('2d');

  // white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // rotation normalized
  const rot = ((imgItem.rotation % 360) + 360) % 360;

  // source dims taking rotation into account (swap for 90/270)
  let srcW = img.width, srcH = img.height;
  if (rot === 90 || rot === 270) [srcW, srcH] = [img.height, img.width];

  // compute scale for fit/cover/contain
  const scaleX = canvas.width / srcW;
  const scaleY = canvas.height / srcH;
  let drawW, drawH;
  if (opts.fit === 'cover') {
    const scale = Math.max(scaleX, scaleY);
    drawW = srcW * scale;
    drawH = srcH * scale;
  } else {
    const scale = Math.min(scaleX, scaleY);
    drawW = srcW * scale;
    drawH = srcH * scale;
  }

  // draw rotated image centered
  // create temp canvas with original image (unrotated)
  const temp = document.createElement('canvas');
  temp.width = img.width;
  temp.height = img.height;
  const tctx = temp.getContext('2d');
  tctx.fillStyle = '#ffffff';
  tctx.fillRect(0,0,temp.width,temp.height);
  tctx.drawImage(img, 0, 0);

  ctx.save();
  // center
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rot * Math.PI / 180);
  // draw temp into center with computed drawW/drawH
  ctx.drawImage(temp, -drawW/2, -drawH/2, drawW, drawH);
  ctx.restore();

  // Convert to JPEG dataURL
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

  // Place in pdf at (margin, margin) occupying innerWmm x innerHmm (mm)
  const x = opts.margin;
  const y = opts.margin;
  const imgWmm = innerWmm;
  const imgHmm = innerHmm;

  // Finally add to doc
  // Use 'FAST' compression mode if available; fallback if addImage throws
  try {
    doc.addImage(dataUrl, 'JPEG', x, y, imgWmm, imgHmm, undefined, 'FAST');
  } catch (err) {
    // fallback without compression param
    doc.addImage(dataUrl, 'JPEG', x, y, imgWmm, imgHmm);
  }
}

// Clear
clearBtn.addEventListener('click', () => {
  state.images = [];
  renderThumbs();
  status.textContent = '';
});

// initial render
renderThumbs();
