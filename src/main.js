import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';

// v0.11 uses a different factory method
const ffmpeg = createFFmpeg({ log: true });
const state = { loaded: false };

const $ = (id) => document.getElementById(id);

const log = (msg, isError = false) => {
    console.log(msg);
    const el = $('system-log');
    if (el) {
        const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        el.innerHTML += `<div><span style="color: #6366f1">[${time}]</span> ${isError ? '<span style="color: #ef4444">' + msg + '</span>' : msg}</div>`;
        el.scrollTop = el.scrollHeight;
    }
};

const updateStatus = (text, isError = false) => {
    const el = $('status-text');
    if (el) {
        el.innerText = text;
        el.style.color = isError ? '#ef4444' : 'inherit';
    }
};

let videoFile = null;
let audioFile = null;

const init = async () => {
    try {
        log('Starting v0.11 initialization (Stable Legacy)...');
        updateStatus('Initialising system...');

        // In v0.11, load() picks up the core from CDN by default or local path
        // We'll try the default first
        await ffmpeg.load();

        state.loaded = true;
        updateStatus('Ready');
        log('FFmpeg v0.11 successfully loaded.');
    } catch (err) {
        log(`CRITICAL: ${err.message}`, true);
        log('Hint: Check SharedArrayBuffer headers and secure context.', true);
        updateStatus('System Load Error', true);
        console.error(err);
    }
};

document.addEventListener('change', (e) => {
    const target = e.target;
    if (target.type !== 'file') return;
    
    const file = target.files?.[0];
    if (!file) return;

    log(`File selected: ${file.name}`);

    if (target.id === 'video-input') {
        videoFile = file;
        const el = $('video-name');
        if (el) el.innerText = `Selected: ${file.name}`;
    } else if (target.id === 'audio-input') {
        audioFile = file;
        const el = $('audio-name');
        if (el) el.innerText = `Selected: ${file.name}`;
    }

    const mergeBtn = $('merge-btn');
    if (videoFile && audioFile && mergeBtn) {
        if (state.loaded) {
            mergeBtn.disabled = false;
            updateStatus('Files ready.');
        } else {
            updateStatus('Waiting for system...');
        }
    }
});

const mergeBtn = $('merge-btn');
if (mergeBtn) {
    mergeBtn.onclick = async () => {
        if (!videoFile || !audioFile || !state.loaded) return;

        const mode = document.querySelector('input[name="audio-mode"]:checked')?.value || 'replace';
        mergeBtn.disabled = true;
        updateStatus('Processing...');
        log(`Muxing started (v0.11, Mode: ${mode})`);

        ffmpeg.setProgress(({ ratio }) => {
            const percent = Math.round(ratio * 100);
            updateStatus(`Multiplexing: ${percent}%`);
            const pb = $('progress-bar');
            if (pb) pb.style.width = `${percent}%`;
        });

        try {
            log('Writing video to FS...');
            ffmpeg.FS('writeFile', 'v.mp4', await fetchFile(videoFile));
            log('Writing audio to FS...');
            ffmpeg.FS('writeFile', 'a.mp3', await fetchFile(audioFile));

            log('Executing command...');
            const args = (mode === 'replace')
                ? ['-i', 'v.mp4', '-i', 'a.mp3', '-c:v', 'copy', '-c:a', 'aac', '-map', '0:v:0', '-map', '1:a:0', '-shortest', 'out.mp4']
                : ['-i', 'v.mp4', '-i', 'a.mp3', '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first[ao]', '-map', '0:v:0', '-map', '[ao]', '-c:v', 'copy', '-c:a', 'aac', 'out.mp4'];

            await ffmpeg.run(...args);

            log('Reading output...');
            const data = ffmpeg.FS('readFile', 'out.mp4');
            const blob = new Blob([data.buffer], { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `merged_${Date.now()}.mp4`;
            link.click();

            updateStatus('Success!');
            log('Muxing complete.');
        } catch (err) {
            log(`Muxing Error: ${err.message}`, true);
            updateStatus('Muxing Failed', true);
        } finally {
            mergeBtn.disabled = false;
        }
    };
}

init();
