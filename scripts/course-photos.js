/* Shared course portraits. Storage is independent of rounds and scoring. */
window.FortisCoursePhotos = (() => {
  const BUCKET = 'course-photos';
  const MAX_INPUT = 12 * 1024 * 1024;
  let generation = 0;
  let urls = [];
  function canonicalCourse(code, courses, combos) {
    const value = String(code || '').trim();
    const combo = combos.find(c => c.combo_code === value || c.parent_course_code === value);
    const course = courses.find(c => c.course_name === value);
    return String(combo?.parent_course_code || course?.course_group || course?.course_name || value).normalize('NFC');
  }
  async function photoPath(code) {
    if (!code) throw new Error('請先選擇球場。');
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
    return `courses/${Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')}.jpg`;
  }
  function validateFile(file) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('請選擇 JPG、PNG 或 WebP 照片；HEIC 請先轉為 JPG。');
    }
    if (!file.size || file.size > MAX_INPUT) throw new Error('請選擇 12 MB 以內的照片。');
  }
  async function compress(file) {
    validateFile(file);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 80000000) {
        throw new Error('照片尺寸過大或無法讀取，請選擇較小的照片。');
      }
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .82));
      if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('照片無法壓縮，請選擇較小的照片。');
      return blob;
    } finally { URL.revokeObjectURL(url); }
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  async function mountBackgrounds({client, user, courses, combos, items}) {
    const run = ++generation;
    urls.forEach(url => URL.revokeObjectURL(url));
    urls = [];
    const groups = new Map();
    for (const {code, element} of items) {
      if (!element) continue;
      element.classList.remove('has-course-photo');
      element.style.backgroundImage = '';
      if (!code) continue;
      const key = canonicalCourse(code, courses, combos);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(element);
    }
    if (!client || !user) return;
    const queue = [...groups];
    await Promise.all(Array.from({length:Math.min(4,queue.length)}, async () => {
      while (queue.length && generation === run) {
        const [code, elements] = queue.shift();
        try {
          const {data, error} = await client.storage.from(BUCKET).download(await photoPath(code));
          if (error || !data || generation !== run) continue;
          const url = URL.createObjectURL(data);
          urls.push(url);
          const img = new Image();
          img.src = url;
          await img.decode();
          if (generation !== run) continue;
          for (const element of elements) {
            if (!element.isConnected) continue;
            element.style.backgroundImage = `linear-gradient(rgba(9,17,26,.30),rgba(9,17,26,.58)),url(${JSON.stringify(url)})`;
            element.classList.add('has-course-photo');
          }
        } catch { /* Keep the normal card for unavailable or invalid photos. */ }
      }
    }));
  }
  async function mount(host, {client, user, courses, combos, label}) {
    const run = ++generation;
    urls.forEach(url => URL.revokeObjectURL(url));
    urls = [];
    if (!host || !user || !client) return;
    host.replaceChildren();
    const heading = el('div', 'fg-section-heading');
    heading.append(el('h2', '', '球場照片'));
    host.append(heading);
    const known = new Map();
    const add = code => {
      const key = canonicalCourse(code, courses, combos);
      if (key) known.set(key, label(key));
      return key;
    };
    courses.forEach(c => add(c.course_name));
    combos.forEach(c => add(c.parent_course_code));
    const storage = client.storage.from(BUCKET);
    async function loadImage(code, target) {
      target.replaceChildren(el('span', 'small', '載入照片中…'));
      try {
        const {data, error} = await storage.download(await photoPath(code));
        if (error || !data) throw error || new Error('No photo');
        if (generation !== run || !target.isConnected) return;
        const url = URL.createObjectURL(data);
        urls.push(url);
        const img = el('img');
        img.alt = `${known.get(code) || code} 球場代表照片`;
        img.onload = () => { if (generation === run && target.isConnected) { target.replaceChildren(img); } };
        img.onerror = () => { if (generation === run && target.isConnected) { target.replaceChildren(el('span', 'small', '照片暫時無法顯示')); } };
        img.src = url;
      } catch {
        if (generation === run && target.isConnected) { target.replaceChildren(el('span', 'small', '尚無照片或目前無法載入')); }
      }
    }
    const form = el('form', 'course-photo-form');
    const selectLabel = el('label', '', '選擇球場');
    const select = el('select');
    select.id = 'coursePhotoSelect';
    selectLabel.htmlFor = select.id;
    select.append(new Option('請選擇球場', ''));
    [...known].sort((a,b) => a[1].localeCompare(b[1])).forEach(([code,name]) => select.append(new Option(name,code)));
    const current = el('div', 'course-photo-frame hidden');
    const input = el('input');
    input.id = 'coursePhotoFile'; input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
    input.hidden = true;
    const choosePhoto = el('button', 'btn2', '上傳照片'); choosePhoto.type = 'button';
    choosePhoto.onclick = () => input.click();
    const camera = el('input');
    camera.type = 'file'; camera.accept = 'image/*'; camera.setAttribute('capture', 'environment'); camera.hidden = true;
    const takePhoto = el('button', 'btn2', '拍攝照片'); takePhoto.type = 'button';
    takePhoto.onclick = () => camera.click();
    const actions = el('div', 'course-photo-actions'); actions.append(choosePhoto, takePhoto);
    const preview = el('div', 'course-photo-frame hidden');
    const status = el('p', 'small'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const save = el('button', 'fg-button', '儲存照片'); save.type = 'submit'; save.disabled = true;
    const note = el('p', 'small', '每球場一張，儲存即取代原圖。請使用可分享的照片。' );
    form.append(selectLabel, select, current, actions, input, camera, preview, note, save, status);
    host.append(form);
    let pending = null, choice = 0, previewUrl = null;
    const reset = () => {
      choice++; pending = null; save.disabled = true; input.value = ''; camera.value = ''; preview.replaceChildren(); preview.classList.add('hidden');
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null; status.textContent = '';
    };
    select.onchange = () => {
      reset();
      current.classList.toggle('hidden', !select.value);
      // A new target prevents an earlier course request from painting the new selection.
      const target = el('div', 'course-photo-frame'); current.replaceChildren(target);
      if (select.value) void loadImage(select.value, target);
    };
    const preparePhoto = async event => {
      const file = event.currentTarget.files[0];
      if (!file) return;
      reset();
      if (!select.value) { status.textContent = '請先選擇球場。'; return; }
      const revision = choice;
      status.textContent = '正在準備照片…';
      try {
        const blob = await compress(file);
        if (choice !== revision || generation !== run) return;
        pending = blob; previewUrl = URL.createObjectURL(blob); urls.push(previewUrl);
        const img = el('img'); img.src = previewUrl; img.alt = '即將儲存的球場照片預覽';
        preview.replaceChildren(img); preview.classList.remove('hidden'); current.classList.add('hidden'); save.disabled = false;
        status.textContent = '照片已準備完成，請確認後儲存。';
      } catch (error) { if (choice === revision) status.textContent = error.message; }
    };
    input.onchange = preparePhoto;
    camera.onchange = preparePhoto;
    form.onsubmit = async event => {
      event.preventDefault();
      if (!pending || !select.value || save.disabled) return;
      const code = select.value, blob = pending;
      save.disabled = true; select.disabled = true; input.disabled = true; camera.disabled = true; takePhoto.disabled = true; choosePhoto.disabled = true;
      status.textContent = '照片上傳中…';
      try {
        const {error} = await storage.upload(await photoPath(code), blob, {upsert: true, contentType:'image/jpeg', cacheControl:'0'});
        if (error) throw error;
        if (generation !== run) return;
        reset(); current.classList.remove('hidden'); status.textContent = '球場照片已儲存。';
        await loadImage(code, current.firstElementChild);
      } catch {
        status.textContent = '上傳失敗，請檢查連線與登入狀態後重試。若持續失敗，請管理員確認球場照片儲存空間已啟用。';
        save.disabled = false;
      } finally { select.disabled = false; input.disabled = false; camera.disabled = false; takePhoto.disabled = false; choosePhoto.disabled = false; }
    };

  }
  return {mount, mountBackgrounds, canonicalCourse, photoPath, validateFile};
})();
