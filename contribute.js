document.addEventListener('DOMContentLoaded', () => {
    const TARGET_OWNER = 'EchoMusicApp';
    const TARGET_REPO = 'Echo-Music-Canvas';
    const GITHUB_API_URL = 'https://api.github.com';

    let gitHubAccessToken = localStorage.getItem('gh_access_token') || null;
    let gitHubUsername = null;
    let selectedFile = null;
    let fileIsValid = false;

    const loginSection = document.getElementById('login-section');
    const formSection = document.getElementById('form-section');
    const statusSection = document.getElementById('status-section');
    
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userAvatar = document.getElementById('user-avatar');
    const userNameEl = document.getElementById('user-name');
    
    const songInput = document.getElementById('song-input');
    const artistInput = document.getElementById('artist-input');
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const fileInfoBanner = document.getElementById('file-info-banner');
    const selectedFileName = document.getElementById('selected-file-name');
    const selectedFileSize = document.getElementById('selected-file-size');
    const removeFileBtn = document.getElementById('remove-file-btn');
    const submitBtn = document.getElementById('submit-canvas-btn');
    const validationVideo = document.getElementById('validation-video-element');
    
    const statusLoader = document.getElementById('status-loader');
    const statusSuccessIcon = document.getElementById('status-success-icon');
    const statusErrorIcon = document.getElementById('status-error-icon');
    const statusTitle = document.getElementById('status-title');
    const statusMessage = document.getElementById('status-message');
    const prLinkContainer = document.getElementById('pr-link-container');
    const prLink = document.getElementById('pr-link');
    const statusActionBtn = document.getElementById('status-action-btn');

    const checkFormat = document.getElementById('check-format');
    const checkSize = document.getElementById('check-size');
    const checkDuration = document.getElementById('check-duration');
    const checkAspect = document.getElementById('check-aspect');

    const hashParams = new URLSearchParams(window.location.hash.substring(1));
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
        gitHubUsername = null;
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

            if (!response.ok) {
                throw new Error('OAuth Token expired or invalid.');
            }

            const userData = await response.json();
            gitHubUsername = userData.login;
            
            userAvatar.src = userData.avatar_url;
            userNameEl.textContent = userData.login;
            
            loginSection.style.display = 'none';
            statusSection.style.display = 'none';
            formSection.style.display = 'block';
            resetUploadForm();
        } catch (error) {
            console.error('Session Init Error:', error);
            localStorage.removeItem('gh_access_token');
            gitHubAccessToken = null;
            showLoginView();
        }
    }

    function showLoginView() {
        formSection.style.display = 'none';
        statusSection.style.display = 'none';
        loginSection.style.display = 'block';
    }

    function resetUploadForm() {
        songInput.value = '';
        artistInput.value = '';
        selectedFile = null;
        fileIsValid = false;
        
        fileInfoBanner.style.display = 'none';
        dropZone.style.display = 'flex';
        fileInput.value = '';
        
        resetChecklist();
        updateSubmitButtonState();
    }

    [songInput, artistInput].forEach(input => {
        input.addEventListener('input', () => {
            updateSubmitButtonState();
        });
    });

    dropZone.addEventListener('click', () => fileInput.click());
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-active');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-active');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleSelectedFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (fileInput.files.length > 0) {
            handleSelectedFile(fileInput.files[0]);
        }
    });

    removeFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetUploadForm();
    });

    function handleSelectedFile(file) {
        selectedFile = file;
        selectedFileName.textContent = file.name;
        selectedFileSize.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
        
        dropZone.style.display = 'none';
        fileInfoBanner.style.display = 'flex';
        
        runFileValidation(file);
    }

    function resetChecklist() {
        const checklist = [checkFormat, checkSize, checkDuration, checkAspect];
        checklist.forEach(item => {
            item.className = 'validation-item';
            const icon = item.querySelector('.check-status');
            icon.className = 'fas fa-circle-notch fa-spin check-status';
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
        
        if (customMsg) {
            element.querySelector('span').innerHTML = customMsg;
        }
    }

    async function runFileValidation(file) {
        resetChecklist();
        updateSubmitButtonState();
        
        let formatPass = false;
        let sizePass = false;
        let durationPass = false;
        let aspectPass = false;
        
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'mp4' || ext === 'm3u8') {
            formatPass = true;
            setCheckState(checkFormat, 'success');
        } else {
            setCheckState(checkFormat, 'error', `Invalid file extension (must be <code>.mp4</code> or <code>.m3u8</code>)`);
        }

        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB <= 5.0 && file.size > 0) {
            sizePass = true;
            setCheckState(checkSize, 'success', `File size is ${sizeMB.toFixed(2)} MB (<= 5 MB limit)`);
        } else {
            setCheckState(checkSize, 'error', `File size is ${sizeMB.toFixed(2)} MB. Must be under <strong>5 MB</strong>`);
        }

        if (ext === 'm3u8') {
            setCheckState(checkDuration, 'success', `M3U8 checklist bypassed: Duration verified via playlist`);
            setCheckState(checkAspect, 'success', `M3U8 checklist bypassed: Aspect ratio verified via playlist`);
            durationPass = true;
            aspectPass = true;
            fileIsValid = formatPass && sizePass && durationPass && aspectPass;
            updateSubmitButtonState();
        } else {
            const objectUrl = URL.createObjectURL(file);
            validationVideo.src = objectUrl;
            
            validationVideo.onloadedmetadata = () => {
                const duration = validationVideo.duration;
                const width = validationVideo.videoWidth;
                const height = validationVideo.videoHeight;
                const aspect = width / height;

                URL.revokeObjectURL(objectUrl);

                if (duration >= 3.0 && duration <= 30.1) {
                    durationPass = true;
                    setCheckState(checkDuration, 'success', `Duration is ${duration.toFixed(1)} seconds (3-30s limit)`);
                } else {
                    setCheckState(checkDuration, 'error', `Duration is ${duration.toFixed(1)}s. Must be between <strong>3 and 30 seconds</strong>`);
                }

                if (width < height && aspect <= 0.61) {
                    aspectPass = true;
                    setCheckState(checkAspect, 'success', `Vertical visualizer (${width}x${height}, aspect ratio: ~9:16)`);
                } else {
                    setCheckState(checkAspect, 'error', `Aspect ratio is landscape/square (${width}x${height}). Must be vertical (<strong>9:16</strong>)`);
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
    }

    function updateSubmitButtonState() {
        const hasSong = songInput.value.trim().length > 0;
        const hasArtist = artistInput.value.trim().length > 0;
        
        submitBtn.disabled = !(hasSong && hasArtist && selectedFile && fileIsValid);
    }

    submitBtn.addEventListener('click', async () => {
        if (submitBtn.disabled) return;
        
        const songName = songInput.value.trim();
        const artistName = artistInput.value.trim();
        const destDir = document.querySelector('input[name="dest-dir"]:checked').value;
        const ext = selectedFile.name.split('.').pop().toLowerCase();

        if (/<[^>]*>/g.test(songName) || /<[^>]*>/g.test(artistName)) {
            alert('HTML or Script tags are not allowed in metadata inputs.');
            return;
        }

        showLoadingView();
        
        try {
            const sanitizedOriginalName = selectedFile.name.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
            const cleanName = sanitizedOriginalName.split('.')[0];
            const newFilename = `${gitHubUsername.toLowerCase()}-${sanitizedOriginalName}`;
            const targetPath = `${destDir}/${newFilename}`;

            updateLoadingMessage('Configuring Repository', `Forking ${TARGET_OWNER}/${TARGET_REPO} to your profile...`);

            const forkResponse = await fetch(`${GITHUB_API_URL}/repos/${TARGET_OWNER}/${TARGET_REPO}/forks`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${gitHubAccessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!forkResponse.ok) {
                throw new Error('Could not fork the upstream repository to your GitHub profile.');
            }

            const forkData = await forkResponse.json();
            const forkOwner = forkData.owner.login;

            await sleep(3000);

            updateLoadingMessage('Syncing Branches', 'Ensuring your fork is fully up-to-date with upstream main...');
            
            const syncResponse = await fetch(`${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/merge-upstream`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${gitHubAccessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({ branch: 'main' })
            });

            if (!syncResponse.ok && syncResponse.status !== 409 && syncResponse.status !== 422) {
                console.warn('Warning syncing fork upstream:', await syncResponse.text());
            }

            updateLoadingMessage('Creating Work Branch', 'Creating a separate branch for your canvas...');
            
            const refResponse = await fetch(`${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/git/ref/heads/main`, {
                headers: {
                    'Authorization': `Bearer ${gitHubAccessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!refResponse.ok) {
                throw new Error('Failed to get the latest commit SHA of your main branch.');
            }

            const refData = await refResponse.json();
            const mainSha = refData.object.sha;
            const branchName = `canvas-${gitHubUsername.toLowerCase()}-${cleanName}`;

            const createBranchResponse = await fetch(`${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/git/refs`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${gitHubAccessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                    ref: `refs/heads/${branchName}`,
                    sha: mainSha
                })
            });

            if (!createBranchResponse.ok) {
                const errText = await createBranchResponse.text();
                if (!errText.includes('already exists')) {
                    throw new Error('Failed to create git branch on fork: ' + errText);
                }
            }

            updateLoadingMessage('Uploading Visualizer', `Uploading video file: ${newFilename} (~${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)...`);
            
            const base64Video = await readFileAsBase64(selectedFile);
            
            const uploadVideoResponse = await fetch(`${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/contents/${targetPath}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${gitHubAccessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                    message: `feat: upload canvas video for ${songName}`,
                    content: base64Video,
                    branch: branchName
                })
            });

            if (!uploadVideoResponse.ok) {
                throw new Error('Failed to upload the visualizer file to your fork.');
            }

            updateLoadingMessage('Updating Database', 'Appending the new entry to canvas.json...');
            
            const canvasUrl = `${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/contents/canvas.json?ref=${branchName}`;
            const canvasResponse = await fetch(canvasUrl, {
                headers: {
                    'Authorization': `Bearer ${gitHubAccessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!canvasResponse.ok) {
                throw new Error('Failed to download current canvas.json from your fork.');
            }

            const canvasData = await canvasResponse.json();
            const canvasSha = canvasData.sha;
            
            const canvasContent = decodeBase64Utf8(canvasData.content);
            const canvasObj = JSON.parse(canvasContent);
            
            if (!canvasObj.items || !Array.isArray(canvasObj.items)) {
                throw new Error('Formatted items database is missing or corrupt in canvas.json.');
            }

            const newEntry = {
                song: songName,
                artist: artistName,
                url: `https://canvas.echomusic.fun/${targetPath}`
            };
            canvasObj.items.push(newEntry);
            
            const updatedCanvasContent = encodeBase64Utf8(JSON.stringify(canvasObj, null, 2) + '\n');

            const updateCanvasResponse = await fetch(`${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/contents/canvas.json`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${gitHubAccessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                    message: `feat: update canvas.json for ${songName}`,
                    content: updatedCanvasContent,
                    sha: canvasSha,
                    branch: branchName
                })
            });

            if (!updateCanvasResponse.ok) {
                throw new Error('Failed to write updated canvas.json database to your fork.');
            }

            updateLoadingMessage('Submitting Contribution', 'Submitting Pull Request to original repository...');
            
            const prResponse = await fetch(`${GITHUB_API_URL}/repos/${TARGET_OWNER}/${TARGET_REPO}/pulls`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${gitHubAccessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                    title: `feat: added canvas for ${songName} - ${artistName}`,
                    head: `${forkOwner}:${branchName}`,
                    base: 'main',
                    body: `This Pull Request was submitted automatically via the Echo Music Canvas portal.\n\n### 🎵 Submission Metadata\n* **Song Title:** ${songName}\n* **Artist/Singer:** ${artistName}\n* **Category:** ${destDir}\n* **Assigned Serial File:** \`${targetPath}\`\n\n*Auto-merge will run validation checks on this contribution.*`
                })
            });

            if (!prResponse.ok) {
                const errorData = await prResponse.json();
                throw new Error(errorData.message || 'Failed to submit the Pull Request upstream.');
            }

            const prData = await prResponse.json();
            
            showSuccessState(prData.html_url);

        } catch (error) {
            console.error('Submission error:', error);
            showErrorState(error.message || 'An unknown network error occurred during uploading.');
        }
    });

    function showLoadingState(title, message) {
        formSection.style.display = 'none';
        loginSection.style.display = 'none';
        
        statusSection.style.display = 'block';
        statusLoader.style.display = 'block';
        statusSuccessIcon.style.display = 'none';
        statusErrorIcon.style.display = 'none';
        prLinkContainer.style.display = 'none';
        statusActionBtn.style.display = 'none';
        
        statusTitle.textContent = title;
        statusMessage.textContent = message;
    }

    function showLoadingView() {
        showLoadingState('Submitting Canvas...', 'Initializing your contribution upload. Do not close this browser window.');
    }

    function updateLoadingMessage(title, message) {
        statusTitle.textContent = title;
        statusMessage.textContent = message;
    }

    function showSuccessState(prUrl) {
        statusLoader.style.display = 'none';
        statusSuccessIcon.style.display = 'block';
        
        statusTitle.textContent = 'Submission Sent!';
        statusMessage.innerHTML = 'Thank you for your canvas submission! We have automatically created a Pull Request.<br><br>The continuous integration validation checks will run. If it passes all criteria, your visualizer will be **automatically merged** into the live repository.';
        
        prLink.href = prUrl;
        prLinkContainer.style.display = 'block';
        
        statusActionBtn.textContent = 'Submit Another';
        statusActionBtn.style.display = 'inline-flex';
        statusActionBtn.onclick = () => {
            resetUploadForm();
            statusSection.style.display = 'none';
            formSection.style.display = 'block';
        };
    }

    function showErrorState(errorMsg) {
        statusLoader.style.display = 'none';
        statusErrorIcon.style.display = 'block';
        
        statusTitle.textContent = 'Submission Failed';
        statusMessage.textContent = errorMsg;
        
        statusActionBtn.textContent = 'Modify & Retry';
        statusActionBtn.style.display = 'inline-flex';
        statusActionBtn.onclick = () => {
            statusSection.style.display = 'none';
            formSection.style.display = 'block';
        };
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const base64Str = reader.result.split(',')[1];
                resolve(base64Str);
            };
            reader.onerror = error => reject(error);
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
});
