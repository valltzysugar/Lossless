document.addEventListener('DOMContentLoaded', () => {
    const TARGET_OWNER = 'EchoMusicApp';
    const TARGET_REPO = 'Echo-Music-Canvas';
    const GITHUB_API_URL = 'https://api.github.com';
    const CANVAS_JSON_URL = 'https://raw.githubusercontent.com/EchoMusicApp/Echo-Music-Canvas/main/canvas.json';

    let gitHubAccessToken = localStorage.getItem('gh_access_token') || null;
    let gitHubUsername = null;
    let selectedFile = null;
    let fileIsValid = false;
    let canvasSourceMode = 'upload'; 
    let selectedExistingUrl = null;
    let allCanvasItems = []; 

    const loginSection  = document.getElementById('login-section');
    const formSection   = document.getElementById('form-section');
    const statusSection = document.getElementById('status-section');
    const loginLimitBanner  = document.getElementById('login-limit-banner');
    const limitBarProgress  = document.getElementById('limit-bar-progress');
    const limitStatusText   = document.getElementById('limit-status-text');

    const loginBtn  = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userAvatar  = document.getElementById('user-avatar');
    const userNameEl  = document.getElementById('user-name');

    const destDirRadios     = document.querySelectorAll('input[name="dest-dir"]');
    const canvasSourceRadios = document.querySelectorAll('input[name="canvas-source"]');

    const uploadPanel    = document.getElementById('upload-panel');
    const fileInput      = document.getElementById('file-input');
    const dropZone       = document.getElementById('drop-zone');
    const fileInfoBanner = document.getElementById('file-info-banner');
    const selectedFileName = document.getElementById('selected-file-name');
    const selectedFileSize = document.getElementById('selected-file-size');
    const removeFileBtn  = document.getElementById('remove-file-btn');
    const validationVideo = document.getElementById('validation-video-element');

    const checkFormat   = document.getElementById('check-format');
    const checkSize     = document.getElementById('check-size');
    const checkDuration = document.getElementById('check-duration');
    const checkAspect   = document.getElementById('check-aspect');

    const existingPanel          = document.getElementById('existing-panel');
    const existingSearch         = document.getElementById('existing-search');
    const existingResults        = document.getElementById('existing-results');
    const existingSelectedBanner = document.getElementById('existing-selected-banner');
    const existingSelectedTitle  = document.getElementById('existing-selected-title');
    const existingSelectedUrlEl  = document.getElementById('existing-selected-url');
    const clearExistingBtn       = document.getElementById('clear-existing-btn');

    const songEntriesList = document.getElementById('song-entries-list');
    const addSongBtn      = document.getElementById('add-song-btn');
    const songCountBadge  = document.getElementById('song-count-badge');

    const submitBtn = document.getElementById('submit-canvas-btn');

    const statusLoader      = document.getElementById('status-loader');
    const statusSuccessIcon = document.getElementById('status-success-icon');
    const statusErrorIcon   = document.getElementById('status-error-icon');
    const statusTitle       = document.getElementById('status-title');
    const statusMessage     = document.getElementById('status-message');
    const prLinkContainer   = document.getElementById('pr-link-container');
    const prLink            = document.getElementById('pr-link');
    const statusActionBtn   = document.getElementById('status-action-btn');

    const hashParams   = new URLSearchParams(window.location.hash.substring(1));
    const tokenFromHash = hashParams.get('access_token');
    if (tokenFromHash) {
        gitHubAccessToken = tokenFromHash;
        localStorage.setItem('gh_access_token', tokenFromHash);
        history.replaceState(null, null, 'contribute.html');
    }

    if (gitHubAccessToken) {
        initializeContributorPortal();
    } else {
        showLoginView();
    }

    loginBtn.addEventListener('click', () => {
        if (window.location.protocol === 'file:') {
            window.location.href = 'https://canvas.echomusic.fun/api/auth';
        } else {
            window.location.href = '/api/auth';
        }
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('gh_access_token');
        gitHubAccessToken = null;
        gitHubUsername    = null;
        showLoginView();
    });

    async function initializeContributorPortal() {
        showLoadingState('Verifying Session', 'Please wait while we establish a secure session with GitHub...');
        try {
            const response = await fetch(`${GITHUB_API_URL}/user`, {
                headers: {
                    'Authorization': `Bearer ${gitHubAccessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) throw new Error('OAuth Token expired or invalid.');

            const userData = await response.json();
            gitHubUsername = userData.login;

            userAvatar.src     = userData.avatar_url;
            userNameEl.textContent = userData.login;

            loginSection.style.display  = 'none';
            statusSection.style.display = 'none';
            formSection.style.display   = 'block';

            await loadCanvasItems();
            resetUploadForm();
        } catch (error) {
            console.error('Session Init Error:', error);
            localStorage.removeItem('gh_access_token');
            gitHubAccessToken = null;
            showLoginView();
        }
    }

    async function showLoginView() {
        formSection.style.display   = 'none';
        statusSection.style.display = 'none';
        loginSection.style.display  = 'block';
        await checkLoginLimitStatus();
    }

    async function checkLoginLimitStatus() {
        try {
            let statusUrl = '/api/auth/status';
            if (window.location.protocol === 'file:') {
                statusUrl = 'https://canvas.echomusic.fun/api/auth/status';
            }
            const res  = await fetch(statusUrl);
            if (!res.ok) throw new Error();
            const data = await res.json();
            loginLimitBanner.style.display = 'block';
            const percent = Math.min((data.count / data.limit) * 100, 100);
            limitBarProgress.style.width = `${percent}%`;
            if (data.limitReached) {
                loginBtn.disabled = true;
                limitStatusText.innerHTML = `<span class="limit-warning">Daily limit reached (${data.count}/${data.limit}).</span> Logins are paused until tomorrow to prevent automated spam and protect repository quotas.`;
            } else {
                loginBtn.disabled = false;
                limitStatusText.innerHTML = `<center><strong>${data.count} / ${data.limit} daily logins used.</strong></center> <br> To ensure fair usage, prevent abuse, and maintain service availability within budget, login requests are limited to <strong>500 per day</strong>. If the daily limit is reached, further logins may be temporarily unavailable until the quota resets.`;
            }
        } catch (e) {
            loginLimitBanner.style.display = 'none';
        }
    }

    async function loadCanvasItems() {
        try {
            const res  = await fetch(CANVAS_JSON_URL);
            if (!res.ok) return;
            const data = await res.json();
            if (data.items && Array.isArray(data.items)) {
                const seen = new Set();
                allCanvasItems = data.items.filter(item => {
                    if (seen.has(item.url)) return false;
                    seen.add(item.url);
                    return true;
                });
            }
        } catch (e) {
            console.warn('Could not load canvas.json for search:', e);
        }
    }

    function resetUploadForm() {
        document.getElementById('source-upload').checked = true;
        canvasSourceMode = 'upload';
        uploadPanel.style.display   = 'block';
        existingPanel.style.display = 'none';

        selectedFile  = null;
        fileIsValid   = false;
        fileInfoBanner.style.display = 'none';
        dropZone.style.display       = 'flex';
        fileInput.value              = '';
        resetChecklist();

        selectedExistingUrl = null;
        existingSearch.value = '';
        existingResults.style.display        = 'none';
        existingResults.innerHTML            = '';
        existingSelectedBanner.style.display = 'none';

        document.getElementById('type-song').checked = true;

        songEntriesList.innerHTML = '';
        addSongEntry();

        updateSubmitButtonState();
    }

    destDirRadios.forEach(radio => {
        radio.addEventListener('change', () => updateSubmitButtonState());
    });

    canvasSourceRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            canvasSourceMode = radio.value;
            if (canvasSourceMode === 'upload') {
                uploadPanel.style.display   = 'block';
                existingPanel.style.display = 'none';
            } else {
                uploadPanel.style.display   = 'none';
                existingPanel.style.display = 'block';
            }
            updateSubmitButtonState();
        });
    });

    dropZone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault(); e.stopPropagation();
            dropZone.classList.add('drag-active');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault(); e.stopPropagation();
            dropZone.classList.remove('drag-active');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) handleSelectedFile(files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if (fileInput.files.length > 0) handleSelectedFile(fileInput.files[0]);
    });

    removeFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedFile  = null;
        fileIsValid   = false;
        fileInfoBanner.style.display = 'none';
        dropZone.style.display       = 'flex';
        fileInput.value              = '';
        resetChecklist();
        updateSubmitButtonState();
    });

    function handleSelectedFile(file) {
        selectedFile = file;
        selectedFileName.textContent = file.name;
        selectedFileSize.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
        dropZone.style.display       = 'none';
        fileInfoBanner.style.display = 'flex';
        runFileValidation(file);
    }

    function resetChecklist() {
        [checkFormat, checkSize, checkDuration, checkAspect].forEach(item => {
            item.className = 'validation-item';
            item.querySelector('.check-status').className = 'fas fa-circle-notch fa-spin check-status';
        });
    }

    function setCheckState(element, state, customMsg = '') {
        const icon = element.querySelector('.check-status');
        element.className = 'validation-item';
        if (state === 'success') {
            element.classList.add('valid');
            icon.className = 'fas fa-check-circle check-status';
        } else if (state === 'error') {
            element.classList.add('invalid');
            icon.className = 'fas fa-times-circle check-status';
        } else {
            icon.className = 'fas fa-circle-notch fa-spin check-status';
        }
        if (customMsg) element.querySelector('span').innerHTML = customMsg;
    }

    async function runFileValidation(file) {
        resetChecklist();
        fileIsValid = false;
        updateSubmitButtonState();

        let formatPass = false, sizePass = false, durationPass = false, aspectPass = false;

        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'mp4') {
            formatPass = true;
            setCheckState(checkFormat, 'success');
        } else {
            setCheckState(checkFormat, 'error', `Invalid file extension — only <code>.mp4</code> is accepted`);
        }

        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB <= 5.0 && file.size > 0) {
            sizePass = true;
            setCheckState(checkSize, 'success', `File size is ${sizeMB.toFixed(2)} MB (&le; 5 MB limit)`);
        } else {
            setCheckState(checkSize, 'error', `File size is ${sizeMB.toFixed(2)} MB. Must be under <strong>5 MB</strong>`);
        }

        const objectUrl = URL.createObjectURL(file);
        validationVideo.src = objectUrl;

        validationVideo.onloadedmetadata = () => {
            const duration = validationVideo.duration;
            const width    = validationVideo.videoWidth;
            const height   = validationVideo.videoHeight;
            const aspect   = width / height;

            URL.revokeObjectURL(objectUrl);

            if (duration >= 3.0 && duration <= 30.1) {
                durationPass = true;
                setCheckState(checkDuration, 'success', `Duration is ${duration.toFixed(1)} seconds (3–30s limit)`);
            } else {
                setCheckState(checkDuration, 'error', `Duration is ${duration.toFixed(1)}s. Must be between <strong>3 and 30 seconds</strong>`);
            }

            if (width < height && aspect <= 0.61) {
                aspectPass = true;
                setCheckState(checkAspect, 'success', `Vertical visualizer (${width}×${height}, ~9:16)`);
            } else {
                setCheckState(checkAspect, 'error', `Ratio is landscape/square (${width}×${height}). Must be vertical (<strong>9:16</strong>)`);
            }

            fileIsValid = formatPass && sizePass && durationPass && aspectPass;
            updateSubmitButtonState();
        };

        validationVideo.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            setCheckState(checkDuration, 'error', 'Failed to load video metadata. The file might be corrupted.');
            setCheckState(checkAspect, 'error', 'Could not read video dimensions.');
            fileIsValid = false;
            updateSubmitButtonState();
        };
    }

    let searchDebounce = null;
    existingSearch.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(runExistingSearch, 220);
    });

    function runExistingSearch() {
        const q = existingSearch.value.trim().toLowerCase();
        if (!q) {
            existingResults.style.display = 'none';
            existingResults.innerHTML     = '';
            return;
        }
        const matches = allCanvasItems.filter(item =>
            item.song.toLowerCase().includes(q)   ||
            item.artist.toLowerCase().includes(q) ||
            item.url.toLowerCase().includes(q)
        ).slice(0, 12);

        if (!matches.length) {
            existingResults.innerHTML     = '<p class="existing-no-results">No canvases found matching your query.</p>';
            existingResults.style.display = 'block';
            return;
        }

        existingResults.innerHTML = matches.map((item, idx) => `
            <button type="button" class="existing-result-item" data-url="${escapeAttr(item.url)}" data-label="${escapeAttr(item.song + ' — ' + item.artist)}">
                <span class="existing-result-label">
                    <span class="existing-result-song">${escapeHtml(item.song)}</span>
                    <span class="existing-result-artist">${escapeHtml(item.artist)}</span>
                </span>
                <span class="existing-result-url">${escapeHtml(shortenUrl(item.url))}</span>
            </button>
        `).join('');
        existingResults.style.display = 'block';

        existingResults.querySelectorAll('.existing-result-item').forEach(btn => {
            btn.addEventListener('click', () => {
                selectExistingCanvas(btn.dataset.url, btn.dataset.label);
            });
        });
    }

    function selectExistingCanvas(url, label) {
        selectedExistingUrl = url;
        existingSelectedTitle.textContent  = label;
        existingSelectedUrlEl.textContent  = shortenUrl(url);
        existingSelectedBanner.style.display = 'flex';
        existingResults.style.display = 'none';
        existingSearch.value          = '';
        updateSubmitButtonState();
    }

    clearExistingBtn.addEventListener('click', () => {
        selectedExistingUrl = null;
        existingSelectedBanner.style.display = 'none';
        existingSearch.value = '';
        updateSubmitButtonState();
    });

    function shortenUrl(url) {
        try {
            const u = new URL(url);
            return u.hostname + u.pathname;
        } catch {
            return url;
        }
    }

    let songEntryIdCounter = 0;

    function addSongEntry(songVal = '', artistVal = '') {
        const id = ++songEntryIdCounter;
        const row = document.createElement('div');
        row.className   = 'song-entry-row';
        row.dataset.id  = id;
        row.innerHTML = `
            <div class="song-entry-search" style="margin-bottom: 1rem;">
                <div class="existing-search-box">
                    <i class="fas fa-search existing-search-icon"></i>
                    <input type="text" class="song-api-search" placeholder="Search YT Music for song..." autocomplete="off">
                    <i class="fas fa-circle-notch fa-spin search-loader" style="display: none; position: absolute; right: 1rem; color: var(--text-dim);"></i>
                </div>
                <div class="api-search-results existing-results-list" style="display: none; max-height: 250px; overflow-y: auto; margin-top: 0.5rem;"></div>
            </div>
            <div class="song-entry-fields">
                <input type="text"
                       class="song-entry-song"
                       placeholder="Song title (e.g. Lost in Yesterday)"
                       autocomplete="off"
                       maxlength="120"
                       value="${escapeAttr(songVal)}">
                <input type="text"
                       class="song-entry-artist"
                       placeholder="Artist name (e.g. Tame Impala)"
                       autocomplete="off"
                       maxlength="120"
                       value="${escapeAttr(artistVal)}">
            </div>
            <button type="button" class="btn-remove-song-entry" title="Remove this entry">
                <i class="fas fa-trash-alt"></i>
            </button>
        `;

        row.querySelector('.btn-remove-song-entry').addEventListener('click', () => {
            row.remove();
            updateSongCountBadge();
            updateSubmitButtonState();
        });

        row.querySelectorAll('input[type="text"]').forEach(inp => {
            inp.addEventListener('input', () => {
                updateSubmitButtonState();
            });
        });

        const searchInput = row.querySelector('.song-api-search');
        const resultsContainer = row.querySelector('.api-search-results');
        const loaderIcon = row.querySelector('.search-loader');
        const songInput = row.querySelector('.song-entry-song');
        const artistInput = row.querySelector('.song-entry-artist');
        let searchTimeout = null;

        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const query = searchInput.value.trim();
            if (!query) {
                resultsContainer.style.display = 'none';
                resultsContainer.innerHTML = '';
                loaderIcon.style.display = 'none';
                return;
            }

            loaderIcon.style.display = 'block';
            searchTimeout = setTimeout(async () => {
                try {
                    const apiUrl = `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=music_songs`;
                    const res = await fetch(apiUrl);
                    if (!res.ok) throw new Error('Network response was not ok');
                    const data = await res.json();
                    
                    loaderIcon.style.display = 'none';
                    const items = (data.items || []).slice(0, 10);
                    
                    if (items.length === 0) {
                        resultsContainer.innerHTML = '<p class="existing-no-results">No songs found.</p>';
                        resultsContainer.style.display = 'block';
                        return;
                    }

                    resultsContainer.innerHTML = items.map((item, idx) => {
                        const songName = item.title || item.name || '';
                        const artistName = item.uploaderName || item.author || (item.artists && item.artists[0] ? item.artists[0].name : 'Unknown Artist');
                        const thumbnail = item.thumbnail || '';
                        
                        return \`
                            <button type="button" class="existing-result-item" data-song="\${escapeAttr(songName)}" data-artist="\${escapeAttr(artistName)}">
                                \${thumbnail ? \`<img src="\${escapeAttr(thumbnail)}" alt="cover" style="width: 40px; height: 40px; border-radius: 4px; margin-right: 1rem; object-fit: cover;">\` : ''}
                                <span class="existing-result-label" style="text-align: left;">
                                    <span class="existing-result-song">\${escapeHtml(songName)}</span>
                                    <span class="existing-result-artist">\${escapeHtml(artistName)}</span>
                                </span>
                            </button>
                        \`;
                    }).join('');
                    resultsContainer.style.display = 'block';

                    resultsContainer.querySelectorAll('.existing-result-item').forEach(btn => {
                        btn.addEventListener('click', () => {
                            songInput.value = btn.dataset.song;
                            artistInput.value = btn.dataset.artist;
                            
                            searchInput.value = '';
                            resultsContainer.style.display = 'none';
                            resultsContainer.innerHTML = '';
                            
                            songInput.style.borderColor = 'var(--accent-primary)';
                            artistInput.style.borderColor = 'var(--accent-primary)';
                            setTimeout(() => {
                                songInput.style.borderColor = '';
                                artistInput.style.borderColor = '';
                            }, 800);
                            
                            updateSubmitButtonState();
                        });
                    });

                } catch (error) {
                    console.error('Error fetching YT Music data:', error);
                    loaderIcon.style.display = 'none';
                    resultsContainer.innerHTML = '<p class="existing-no-results" style="color: #ef4444;">Failed to fetch results. Please try again or enter manually.</p>';
                    resultsContainer.style.display = 'block';
                }
            }, 500);
        });

        document.addEventListener('click', (e) => {
            if (!row.contains(e.target)) {
                resultsContainer.style.display = 'none';
            }
        });

        songEntriesList.appendChild(row);
        updateSongCountBadge();
        updateSubmitButtonState();
    }

    addSongBtn.addEventListener('click', () => addSongEntry());

    function getSongEntries() {
        const rows = songEntriesList.querySelectorAll('.song-entry-row');
        return Array.from(rows).map(row => ({
            song:   row.querySelector('.song-entry-song').value.trim(),
            artist: row.querySelector('.song-entry-artist').value.trim()
        }));
    }

    function updateSongCountBadge() {
        const count = songEntriesList.querySelectorAll('.song-entry-row').length;
        songCountBadge.textContent = count === 1 ? '1 song' : `${count} songs`;
    }

    function updateSubmitButtonState() {
        const entries    = getSongEntries();
        const validEntries = entries.filter(e =>
            e.song.length > 0 && e.artist.length > 0 &&
            !/[<>]/.test(e.song) && !/[<>]/.test(e.artist)
        );
        const hasSongs = validEntries.length > 0 && validEntries.length === entries.length;

        let canvasReady = false;
        if (canvasSourceMode === 'upload') {
            canvasReady = !!(selectedFile && fileIsValid);
        } else {
            canvasReady = !!selectedExistingUrl;
        }

        submitBtn.disabled = !(hasSongs && canvasReady);
    }

    submitBtn.addEventListener('click', async () => {
        if (submitBtn.disabled) return;

        const entries  = getSongEntries();
        const destDir  = document.querySelector('input[name="dest-dir"]:checked').value;

        for (const entry of entries) {
            if (/[<>]/g.test(entry.song) || /[<>]/g.test(entry.artist)) {
                alert('HTML tags are not allowed in song or artist fields.');
                return;
            }
        }

        showLoadingView();

        try {
            if (canvasSourceMode === 'upload') {
                await submitWithNewUpload(entries, destDir);
            } else {
                await submitWithExistingCanvas(entries, destDir);
            }
        } catch (error) {
            console.error('Submission error:', error);
            showErrorState(error.message || 'An unknown network error occurred during submission.');
        }
    });

    async function submitWithNewUpload(entries, destDir) {
        const primaryEntry = entries[0]; 
        const sanitizedOriginalName = selectedFile.name.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
        const cleanName    = sanitizedOriginalName.split('.')[0];
        const newFilename  = `${gitHubUsername.toLowerCase()}-${sanitizedOriginalName}`;
        const targetPath   = `${destDir}/${newFilename}`;
        const canvasUrl    = `https://canvas.echomusic.fun/${targetPath}`;
        const branchName   = `canvas-${gitHubUsername.toLowerCase()}-${cleanName}`;

        const forkOwner = await forkAndSync(branchName, primaryEntry.song);

        updateLoadingMessage('Uploading Visualizer', `Uploading video: ${newFilename}…`);
        const base64Video = await readFileAsBase64(selectedFile);

        const uploadRes = await fetch(`${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/contents/${targetPath}`, {
            method: 'PUT',
            headers: buildHeaders(),
            body: JSON.stringify({
                message: `feat: upload canvas video for ${primaryEntry.song}`,
                content: base64Video,
                branch: branchName
            })
        });
        if (!uploadRes.ok) throw new Error('Failed to upload the visualizer file to your fork.');

        await updateCanvasJson(forkOwner, branchName, entries, canvasUrl);
        const prUrl = await openPullRequest(forkOwner, branchName, entries, destDir, targetPath);
        showSuccessState(prUrl);
    }

    async function submitWithExistingCanvas(entries, destDir) {
        const primaryEntry = entries[0];
        const slug        = primaryEntry.song.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
        const branchName  = `canvas-${gitHubUsername.toLowerCase()}-${slug}-link`;

        const forkOwner = await forkAndSync(branchName, primaryEntry.song);

        await updateCanvasJson(forkOwner, branchName, entries, selectedExistingUrl);
        const prUrl = await openPullRequest(forkOwner, branchName, entries, destDir, selectedExistingUrl);
        showSuccessState(prUrl);
    }

    async function forkAndSync(branchName, songLabel) {
        updateLoadingMessage('Configuring Repository', `Forking ${TARGET_OWNER}/${TARGET_REPO} to your profile…`);

        const forkRes = await fetch(`${GITHUB_API_URL}/repos/${TARGET_OWNER}/${TARGET_REPO}/forks`, {
            method: 'POST',
            headers: buildHeaders()
        });
        if (!forkRes.ok) throw new Error('Could not fork the upstream repository to your GitHub profile.');

        const forkData  = await forkRes.json();
        const forkOwner = forkData.owner.login;

        await sleep(3000);

        updateLoadingMessage('Syncing Branches', 'Ensuring your fork is up-to-date with upstream main…');
        const syncRes = await fetch(`${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/merge-upstream`, {
            method: 'POST',
            headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ branch: 'main' })
        });
        if (!syncRes.ok && syncRes.status !== 409 && syncRes.status !== 422) {
            console.warn('Warning syncing fork:', await syncRes.text());
        }

        updateLoadingMessage('Creating Work Branch', 'Creating a separate branch for your canvas…');
        const refRes = await fetch(`${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/git/ref/heads/main`, {
            headers: buildHeaders()
        });
        if (!refRes.ok) throw new Error('Failed to get the latest commit SHA of main.');

        const refData  = await refRes.json();
        const mainSha  = refData.object.sha;

        const branchRes = await fetch(`${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/git/refs`, {
            method: 'POST',
            headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: mainSha })
        });
        if (!branchRes.ok) {
            const txt = await branchRes.text();
            if (!txt.includes('already exists')) throw new Error('Failed to create branch: ' + txt);
        }

        return forkOwner;
    }

    async function updateCanvasJson(forkOwner, branchName, entries, canvasVideoUrl) {
        updateLoadingMessage('Updating Database', `Adding ${entries.length} song entr${entries.length === 1 ? 'y' : 'ies'} to canvas.json…`);

        const canvasApiUrl = `${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/contents/canvas.json?ref=${branchName}`;
        const canvasRes = await fetch(canvasApiUrl, { headers: buildHeaders() });
        if (!canvasRes.ok) throw new Error('Failed to download canvas.json from your fork.');

        const canvasData    = await canvasRes.json();
        const canvasSha     = canvasData.sha;
        const canvasContent = decodeBase64Utf8(canvasData.content);
        const canvasObj     = JSON.parse(canvasContent);

        if (!canvasObj.items || !Array.isArray(canvasObj.items)) {
            throw new Error('canvas.json items database is missing or corrupt.');
        }

        const newEntries = entries.map(entry => ({
            song:   entry.song,
            artist: entry.artist,
            url:    canvasVideoUrl
        }));
        canvasObj.items.unshift(...newEntries);

        const updatedContent = encodeBase64Utf8(JSON.stringify(canvasObj, null, 2) + '\n');

        const updateRes = await fetch(`${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/contents/canvas.json`, {
            method: 'PUT',
            headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `feat: update canvas.json — add ${entries.length} song(s)`,
                content: updatedContent,
                sha:     canvasSha,
                branch:  branchName
            })
        });
        if (!updateRes.ok) throw new Error('Failed to write updated canvas.json to your fork.');
    }

    async function openPullRequest(forkOwner, branchName, entries, destDir, canvasPath) {
        updateLoadingMessage('Submitting Contribution', 'Opening Pull Request on the upstream repository…');

        const isSingle = entries.length === 1;
        const prTitle  = isSingle
            ? `feat: add canvas for ${entries[0].song} — ${entries[0].artist}`
            : `feat: add ${entries.length} songs to canvas — ${entries.map(e => e.song).slice(0, 3).join(', ')}${entries.length > 3 ? '…' : ''}`;

        const songTable = entries.map(e =>
            `| ${e.song} | ${e.artist} |`
        ).join('\n');

        const prBody = `This Pull Request was submitted automatically via the Echo Music Canvas portal.\n\n### 🎵 Submission Metadata\n* **Category:** ${destDir}\n* **Canvas URL / Path:** \`${canvasPath}\`\n* **Total Songs Linked:** ${entries.length}\n\n### 🎶 Song Entries\n| Song Title | Artist |\n|---|---|\n${songTable}\n\n*Validation checks will run automatically on this contribution.*`;

        const prRes = await fetch(`${GITHUB_API_URL}/repos/${TARGET_OWNER}/${TARGET_REPO}/pulls`, {
            method: 'POST',
            headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: prTitle,
                head:  `${forkOwner}:${branchName}`,
                base:  'main',
                body:  prBody
            })
        });
        if (!prRes.ok) {
            const errData = await prRes.json();
            throw new Error(errData.message || 'Failed to submit the Pull Request upstream.');
        }

        const prData = await prRes.json();
        return prData.html_url;
    }

    function showLoadingState(title, message) {
        formSection.style.display   = 'none';
        loginSection.style.display  = 'none';
        statusSection.style.display = 'block';
        statusLoader.style.display  = 'block';
        statusSuccessIcon.style.display = 'none';
        statusErrorIcon.style.display   = 'none';
        prLinkContainer.style.display   = 'none';
        statusActionBtn.style.display   = 'none';
        statusTitle.textContent   = title;
        statusMessage.textContent = message;
    }

    function showLoadingView() {
        showLoadingState('Submitting Canvas…', 'Initializing your contribution. Do not close this browser window.');
    }

    function updateLoadingMessage(title, message) {
        statusTitle.textContent   = title;
        statusMessage.textContent = message;
    }

    function showSuccessState(prUrl) {
        statusLoader.style.display      = 'none';
        statusSuccessIcon.style.display = 'block';
        statusTitle.textContent = 'Submission Sent!';
        statusMessage.innerHTML = 'Thank you for your canvas submission! We have automatically created a Pull Request.<br><br>The continuous integration validation checks will run. Once they pass, a maintainer will review and manually merge your contribution into the live repository.';
        prLink.href = prUrl;
        prLinkContainer.style.display = 'block';
        statusActionBtn.textContent = 'Submit Another';
        statusActionBtn.style.display = 'inline-flex';
        statusActionBtn.onclick = () => {
            resetUploadForm();
            statusSection.style.display = 'none';
            formSection.style.display   = 'block';
        };
    }

    function showErrorState(errorMsg) {
        statusLoader.style.display    = 'none';
        statusErrorIcon.style.display = 'block';
        statusTitle.textContent = 'Submission Failed';
        statusMessage.textContent = errorMsg;
        statusActionBtn.textContent = 'Modify & Retry';
        statusActionBtn.style.display = 'inline-flex';
        statusActionBtn.onclick = () => {
            statusSection.style.display = 'none';
            formSection.style.display   = 'block';
        };
    }

    function buildHeaders() {
        return {
            'Authorization': `Bearer ${gitHubAccessToken}`,
            'Accept': 'application/vnd.github.v3+json'
        };
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload  = () => resolve(reader.result.split(',')[1]);
            reader.onerror = err => reject(err);
        });
    }

    function decodeBase64Utf8(base64Str) {
        const binString = atob(base64Str.replace(/\s/g, ''));
        return new TextDecoder().decode(Uint8Array.from(binString, m => m.charCodeAt(0)));
    }

    function encodeBase64Utf8(str) {
        const binString = Array.from(new TextEncoder().encode(str), byte => String.fromCharCode(byte)).join('');
        return btoa(binString);
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(str) {
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
});
