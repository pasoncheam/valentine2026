document.addEventListener('DOMContentLoaded', () => {
    const crankContainer = document.getElementById('crank-container');
    const crankArm = document.querySelector('.crank-arm');
    const audio = document.getElementById('voice-note');
    const canvas = document.getElementById('audio-visualizer');
    const ctx = canvas.getContext('2d');

    // State
    let isDragging = false;
    let currentAngle = 0;
    let lastMouseAngle = 0;
    let velocity = 0;
    let lastTime = 0;
    const FRICTION = 0.95; // How quickly it slows down
    const VELOCITY_SCALE = 0.5; // Sensitivity

    // Audio State
    let isAudioSetup = false;
    let audioContext;
    let analyser;
    let source;

    // Check if running on local file - if so, we must SIMULATE visualizer to avoid silent audio
    const isLocalFile = window.location.protocol === 'file:';

    // Resize canvas
    function resizeCanvas() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Debug helper
    function log(msg) {
        console.log(msg);
        let logBox = document.getElementById('debug-log');
        if (!logBox) {
            logBox = document.createElement('div');
            logBox.id = 'debug-log';
            logBox.style.position = 'absolute';
            logBox.style.top = '10px';
            logBox.style.left = '10px';
            logBox.style.background = 'rgba(0,0,0,0.7)';
            logBox.style.color = '#fff';
            logBox.style.padding = '5px';
            logBox.style.borderRadius = '4px';
            logBox.style.fontSize = '12px';
            logBox.style.maxWidth = '200px';
            logBox.style.zIndex = '9999';
            logBox.style.pointerEvents = 'none';
            document.body.appendChild(logBox);
        }
        logBox.innerHTML = msg + '<br>' + logBox.innerHTML;
    }

    // Setup Audio
    function setupAudio() {
        if (isAudioSetup) {
            // If already setup, just make sure context is running (if using one)
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume();
            }
            return;
        }

        //log("Setting up audio...");

        if (isLocalFile) {
            // LOCAL FILE MODE: Do NOT use Web Audio API for source to avoid CORS silence
            //log("Local file detected. Using simulated visualizer to ensure sound plays.");
            isAudioSetup = true;
            return;
        }

        // WEB SERVER MODE: Use full Web Audio API
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            source = audioContext.createMediaElementSource(audio);
            source.connect(analyser);
            analyser.connect(audioContext.destination);

            analyser.fftSize = 64;
            isAudioSetup = true;
            log("Audio setup complete (Web Mode)");
        } catch (e) {
            log("Audio setup failed: " + e.message);
            // Fallback to simple mode if context fails
            isAudioSetup = true;
        }
    }

    // Allow auto-unlock
    document.addEventListener('click', setupAudio);
    document.addEventListener('touchstart', setupAudio);

    // Geometry helper
    function getAngle(x, y) {
        const rect = crankContainer.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return Math.atan2(y - centerY, x - centerX);
    }

    // Input Handlers
    function startDrag(e) {
        isDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        lastMouseAngle = getAngle(clientX, clientY);

        setupAudio();

        // Ensure playback starts/unlocks
        if (audio.paused) {
            // Play momentary silence or just try to play/pause to unlock
            // Actually, we process playback in the loop based on velocity
        }
    }

    function moveDrag(e) {
        if (!isDragging) return;
        e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const angle = getAngle(clientX, clientY);
        let delta = angle - lastMouseAngle;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;

        currentAngle += delta;
        velocity = delta * 5;
        lastMouseAngle = angle;
        updateCrankVisual();
    }

    function endDrag() {
        isDragging = false;
    }

    // Event Listeners
    crankContainer.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', endDrag);
    crankContainer.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('touchmove', moveDrag, { passive: false });
    window.addEventListener('touchend', endDrag);

    // Visual Update
    const crankSpinner = document.getElementById('crank-spinner');
    function updateCrankVisual() {
        const deg = currentAngle * (180 / Math.PI);
        crankSpinner.style.transform = `rotate(${deg}deg)`;
    }

    // Animation Loop
    function loop(time) {
        const dt = time - lastTime;
        lastTime = time;

        if (!isDragging) {
            velocity *= FRICTION;
            currentAngle += velocity;
            updateCrankVisual();
        }

        if (Math.abs(velocity) < 0.001) velocity = 0;

        // Audio Logic
        const speed = Math.abs(velocity);

        if (speed > 0.02) {
            if (audio.paused) {
                const p = audio.play();
                if (p) p.catch(e => { /* Ignore auto-play errors until interaction */ });
            }
            let rate = 0.5 + (speed * 3);
            if (rate > 1.5) rate = 1.5;
            if (rate < 0.8) rate = 0.8;
            audio.playbackRate = rate;
            audio.volume = Math.min(1, speed * 5);
        } else {
            if (!audio.paused) {
                audio.pause();
            }
        }

        drawVisualizer(speed);
        requestAnimationFrame(loop);
    }

    // Generate static waveform for "always visible" effect
    const bufferLength = 32;
    const pseudoWaveform = new Array(bufferLength).fill(0).map(() => Math.random() * 50 + 10);

    function drawVisualizer(speed) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Calculate progress logic (universal)
        let progress = 0;
        if (audio.duration > 0 && !isNaN(audio.duration)) {
            progress = audio.currentTime / audio.duration;
        }

        // Gradient
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        const activeColor = '#db2777';
        const inactiveColor = '#e5e7eb';
        const stopPoint = Math.max(0, Math.min(1, progress));
        gradient.addColorStop(0, activeColor);
        gradient.addColorStop(stopPoint, activeColor);
        gradient.addColorStop(Math.min(1, stopPoint + 0.001), inactiveColor);
        gradient.addColorStop(1, inactiveColor);
        ctx.fillStyle = gradient;

        // Calculate dynamic bar width to fit exact canvas width
        const barWidth = (canvas.width / bufferLength) - 1;
        let x = 0;

        let dataArray;

        // If using real analyser (Web Mode)
        if (analyser && !isLocalFile) {
            dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);
        }

        for (let i = 0; i < bufferLength; i++) {
            let barHeight = pseudoWaveform[i]; // Default to static waveform

            if (analyser && !isLocalFile && dataArray) {
                // Real data mixing
                // Map larger buffer to 32 bars roughly
                const index = Math.floor(i * (dataArray.length / bufferLength));
                // Mix real data with static shape for a "live" feel that returns to shape
                const realHeight = dataArray[index] / 2;
                if (speed > 0.01) {
                    barHeight = realHeight;
                }
            } else {
                // Simulated data based on speed
                if (speed > 0.02) {
                    // Jitter the static waveform slightly when "playing"
                    barHeight += (Math.random() - 0.5) * (speed * 50);
                }
            }

            if (barHeight < 4) barHeight = 4;
            // Cap height
            if (barHeight > canvas.height) barHeight = canvas.height;

            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }

        updatePhotos(progress);
    }

    // Photo Sequence Logic
    const photos = document.querySelectorAll('.photo');
    let currentPhotoIndex = 0;

    function updatePhotos(progress) {
        if (photos.length === 0) return;

        // Map progress (0.0 to 1.0) to photo index
        let index = Math.floor(progress * photos.length);

        // Clamp index
        if (index >= photos.length) index = photos.length - 1;
        if (index < 0) index = 0;

        // Only update class if changed
        if (index !== currentPhotoIndex) {
            // Remove active from old
            photos[currentPhotoIndex].classList.remove('active');

            // Add active to new
            photos[index].classList.add('active');

            currentPhotoIndex = index;
        }
    }

    requestAnimationFrame(loop);
});
