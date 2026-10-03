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
  const clean = value => String(value || '').normalize('NFKC').trim();
  const searchable = value => clean(value).toLocaleLowerCase();
  function courseEntries(courses, combos, label) {
    const entries = courses.map((course, index) => {
      const code = String(course.course_name || '');
      return {value: `course:${course.id ?? index}`, code,
        photoCode: canonicalCourse(code, courses, combos),
        name: course.display_name_zh || course.display_name_ja || course.display_name || label(code) || code,
        country: clean(course.country), region: clean(course.region), prefecture: clean(course.prefecture),
        search: searchable([code, course.display_name, course.display_name_zh, course.display_name_ja, label(code)].join(' '))};
    });
    // Keep parent-only clubs available without replacing any master records.
    const parents = new Set(entries.map(entry => entry.code));
    combos.forEach(combo => {
      const code = combo.parent_course_code;
      if (!code || parents.has(code)) return;
      parents.add(code);
      const child = entries.find(entry => entry.photoCode === code);
      const name = combo.parent_course_name || label(code) || code;
      entries.push({value:`parent:${code}`, code, photoCode:code, name,
        country:clean(combo.country) || child?.country || '', region:child?.region || '',
        prefecture:child?.prefecture || '', search:searchable(`${code} ${name}`)});
    });
    return entries.sort((a,b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
  }
  function filterEntries(entries, {country='', region='', prefecture='', search=''} = {}) {
    const words = searchable(search).split(/\s+/).filter(Boolean);
    return entries.filter(entry => (!country || entry.country === country) &&
      (!region || entry.region === region) && (!prefecture || entry.prefecture === prefecture) &&
      words.every(word => entry.search.includes(word)));
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
    const entries = courseEntries(courses, combos, label);
    const known = new Map(entries.map(entry => [entry.photoCode, entry.name]));
    const byValue = new Map(entries.map(entry => [entry.value, entry]));
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
    const filters = el('div', 'course-photo-filters');
    const controls = {};
    for (const [key, title] of [['country','國家'], ['region','地區／省／州'], ['prefecture','縣市／都道府縣']]) {
      const wrap = el('div');
      const control = el('select'); control.id = `coursePhoto${key}`;
      const caption = el('label', '', title); caption.htmlFor = control.id;
      wrap.append(caption, control); filters.append(wrap); controls[key] = control;
    }
    const searchLabel = el('label', '', '搜尋球場名稱／代碼');
    const search = el('input'); search.id = 'coursePhotoSearch'; search.type = 'search';
    search.placeholder = '輸入球場名稱或代碼'; searchLabel.htmlFor = search.id;
    const count = el('p', 'small'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
    const clear = el('button', 'btn2', '清除篩選'); clear.type = 'button';
    function updateOptions(control, values, placeholder) {
      const previous = control.value;
      control.replaceChildren(new Option(placeholder, ''));
      [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b)).forEach(value => control.append(new Option(value,value)));
      control.value = [...control.options].some(option => option.value === previous) ? previous : '';
    }
    function refreshFilters() {
      updateOptions(controls.country, entries.map(entry=>entry.country), '全部國家');
      const country = controls.country.value;
      updateOptions(controls.region, filterEntries(entries,{country}).map(entry=>entry.region), '全部地區');
      const region = controls.region.value;
      updateOptions(controls.prefecture, filterEntries(entries,{country,region}).map(entry=>entry.prefecture), '全部縣市');
      const matches = filterEntries(entries,{country,region,prefecture:controls.prefecture.value,search:search.value});
      const previous = select.value;
      select.replaceChildren(new Option(matches.length ? '請選擇球場' : '找不到符合的球場', ''));
      matches.forEach(entry=>select.append(new Option(`${entry.name} (${entry.code})`,entry.value)));
      select.value = matches.some(entry=>entry.value===previous) ? previous : '';
      count.textContent = `符合 ${matches.length} / ${entries.length} 項 · 球場主檔 ${courses.length} 筆`;
      if (previous && select.value !== previous) select.onchange();
    }
    Object.values(controls).forEach(control=>{control.onchange=refreshFilters;});
    search.oninput = refreshFilters;
    clear.onclick = () => { Object.values(controls).forEach(control=>{control.value='';}); search.value=''; refreshFilters(); };

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
    const note = el('p', 'small', '每球場一張，同俱樂部分區共用照片；儲存即取代原圖。請使用可分享的照片。' );
    form.append(filters, searchLabel, search, clear, count, selectLabel, select, current, actions, input, camera, preview, note, save, status);
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
      if (select.value) void loadImage(byValue.get(select.value).photoCode, target);
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
      const code = byValue.get(select.value).photoCode, blob = pending;
      save.disabled = true; Object.values(controls).forEach(control=>{control.disabled=true;}); search.disabled=true; clear.disabled=true; select.disabled = true; input.disabled = true; camera.disabled = true; takePhoto.disabled = true; choosePhoto.disabled = true;
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
      } finally { Object.values(controls).forEach(control=>{control.disabled=false;}); search.disabled=false; clear.disabled=false; select.disabled = false; input.disabled = false; camera.disabled = false; takePhoto.disabled = false; choosePhoto.disabled = false; }
    };
    refreshFilters();

  }
  return {courseEntries, filterEntries, mount, mountBackgrounds, canonicalCourse, photoPath, validateFile};
})();
