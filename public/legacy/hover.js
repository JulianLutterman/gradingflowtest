// Rectangular hover effect for the dot container

const container = document.getElementById('dot-container');
let dots = [];

function generateDots() {
    container.innerHTML = '';
    dots = [];

    const containerWidth = container.offsetWidth;
    const containerHeight = container.offsetHeight;

    const dotAspectRatio = 2;
    const dotsPerRow = 11;
    const dotWidth = containerWidth / (dotsPerRow + (dotsPerRow - 1) * 0.14);
    const dotHeight = dotWidth / dotAspectRatio;
    const horizontalSpacing = dotWidth * 0.14;
    const verticalSpacing = dotHeight * 0.23;

    const rows = Math.ceil(containerHeight / (dotHeight + verticalSpacing));

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < dotsPerRow; col++) {
            const dot = document.createElement('div');
            dot.classList.add('dot');

            const x = col * (dotWidth + horizontalSpacing);
            const y = row * (dotHeight + verticalSpacing);

            if (x + dotWidth > containerWidth || y + dotHeight > containerHeight) continue;

            dot.style.width = `${dotWidth}px`;
            dot.style.height = `${dotHeight}px`;
            dot.style.left = `${x}px`;
            dot.style.top = `${y}px`;

            dot.dataset.x = x;
            dot.dataset.y = y;
            dot.dataset.width = dotWidth;

            container.appendChild(dot);
            dots.push(dot);
        }
    }

    const remainingWidth = containerWidth - (dotsPerRow * (dotWidth + horizontalSpacing) - horizontalSpacing);
    if (remainingWidth > dotWidth * 0.5) {
        for (let row = 0; row < rows; row++) {
            const x = containerWidth - dotWidth;
            const y = row * (dotHeight + verticalSpacing);

            const dot = document.createElement('div');
            dot.classList.add('dot');
            dot.style.width = `${dotWidth}px`;
            dot.style.height = `${dotHeight}px`;
            dot.style.left = `${x}px`;
            dot.style.top = `${y}px`;

            container.appendChild(dot);
            dots.push(dot);
        }
    }
}

let mouseX = 0, mouseY = 0;
let isTicking = false;

function updateDots() {
    const containerRect = container.getBoundingClientRect();

    dots.forEach(dot => {
        const dotX = containerRect.left + parseFloat(dot.dataset.x);
        const dotY = containerRect.top + parseFloat(dot.dataset.y);

        const dx = mouseX - dotX;
        const dy = mouseY - dotY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const dotWidth = parseFloat(dot.dataset.width);

        if (distance === 0) return;

        const moveDistance = -dotWidth * 0.9;
        const moveX = moveDistance * (dx / distance);
        const moveY = moveDistance * (dy / distance);

        dot.style.transform = `translate(${moveX}px, ${moveY}px)`;
    });

    isTicking = false;
}

container.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!isTicking) {
        requestAnimationFrame(updateDots);
        isTicking = true;
    }
});

container.addEventListener('mouseleave', () => {
    dots.forEach(dot => {
        dot.style.transform = 'translate(0, 0)';
    });
});

generateDots();
window.addEventListener('resize', () => {
    generateDots();
});