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

    // Audio Context (for visualizer)
    let audioContext;
    let analyser;
    let source;
    let isAudioSetup = false;

    // Resize canvas
    function resizeCanvas() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Setup Audio Context (must be triggered by user interaction)
    function setupAudio() {
        if (isAudioSetup) return;

        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            source = audioContext.createMediaElementSource(audio);
            source.connect(analyser);
            analyser.connect(audioContext.destination);

            analyser.fftSize = 64;
            isAudioSetup = true;
        } catch (e) {
            console.log("Audio setup failed (likely waiting for interaction)", e);
        }
    }

    // Geometry helper: Get angle from center of crank to point (x,y)
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

        // Initialize audio on first touch
        if (!isAudioSetup) {
            setupAudio();
            // Try to play silent momentarily to unlock audio on iOS
            audio.play().then(() => audio.pause()).catch(() => { });
        }
    }

    function moveDrag(e) {
        if (!isDragging) return;
        e.preventDefault(); // Prevent scrolling

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const angle = getAngle(clientX, clientY);
        let delta = angle - lastMouseAngle;

        // Handle wrapping (e.g. going from PI to -PI)
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;

        // Apply rotation
        // We only care about the magnitude of movement for energy, 
        // but direction for visual. Music box usually only winds one way?
        // Let's allow both ways but only play if "winding forward" (clockwise)

        currentAngle += delta;
        velocity = delta * 5; // Add momentum

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
        // Just rotate the whole spinner container
        const deg = currentAngle * (180 / Math.PI);
        crankSpinner.style.transform = `rotate(${deg}deg)`;
    }

    // Animation Loop
    function loop(time) {
        const dt = time - lastTime;
        lastTime = time;

        if (!isDragging) {
            velocity *= FRICTION;
            currentAngle += velocity; // Apply velocity
            updateCrankVisual();
        } else {
            // In dragging mode, currentAngle is updated by moveDrag
        }

        // prevent tiny precision errors
        if (Math.abs(velocity) < 0.001) velocity = 0;

        // Audio Logic
        const speed = Math.abs(velocity);

        // Threshold to play
        if (speed > 0.02) {
            if (audio.paused) {
                // simple play
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.log("Playback prevented (waiting for interaction): " + error);
                    });
                }
            }

            // Map winding speed (approx 0.0 to 0.5 rad/frame) to playback rate
            // 0.05 speed -> 0.8 rate
            // 0.30 speed -> 1.5 rate
            let rate = 0.5 + (speed * 3);
            if (rate > 1.5) rate = 1.5;
            if (rate < 0.8) rate = 0.8;

            audio.playbackRate = rate;
            audio.volume = Math.min(1, speed * 5); // Fade in quickly
        } else {
            if (!audio.paused) {
                // Fade out?
                audio.pause();
            }
        }

        drawVisualizer();
        requestAnimationFrame(loop);
    }

    function drawVisualizer() {
        if (!isAudioSetup) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear

        // Calculate progress
        let progress = 0;
        if (audio.duration > 0 && !isNaN(audio.duration)) {
            progress = audio.currentTime / audio.duration;
        }

        // Create Gradient for Progress Bar Effect
        // Active color (left) -> Inactive color (right)
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);

        // Define colors matching style.css
        const activeColor = '#db2777'; // --accent-pink
        const inactiveColor = '#e5e7eb'; // muted gray/white

        // Hard stop gradient for clear progress indication
        const stopPoint = Math.max(0, Math.min(1, progress));

        gradient.addColorStop(0, activeColor);
        gradient.addColorStop(stopPoint, activeColor);
        gradient.addColorStop(Math.min(1, stopPoint + 0.001), inactiveColor);
        gradient.addColorStop(1, inactiveColor);

        ctx.fillStyle = gradient;

        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 2;

            // Draw bar with the gradient fill
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

            x += barWidth + 1;
        }
    }

    requestAnimationFrame(loop);
});
