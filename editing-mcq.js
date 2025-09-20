function setupMcqEditingUI(container) {
    const subContent = container.querySelector('.sub-question-content');
    if (!subContent) return;

    let mcqContainer = subContent.querySelector('.mcq-options');
    const hadContainer = !!mcqContainer;
    if (!mcqContainer) {
        mcqContainer = document.createElement('div');
        mcqContainer.className = 'mcq-options';
        subContent.appendChild(mcqContainer);
    }

    // 🔒 Take a one-time snapshot of the original MCQ HTML for cancel restore
    if (!container.dataset.mcqSnapshotTaken) {
        container.dataset.mcqOriginalHtml = mcqContainer.innerHTML || '';
        container.dataset.mcqSnapshotTaken = '1';
    }

    // Save original option IDs (for save/delete logic, optional)
    const originalIds = Array.from(mcqContainer.querySelectorAll('.mcq-option'))
        .map(el => el.dataset.mcqOptionId)
        .filter(Boolean);
    const originalIdsJson = JSON.stringify(originalIds);
    container.dataset.originalMcqIds = originalIdsJson;
    container.dataset.mcqHadContainer = hadContainer ? '1' : '0';
    container.dataset.mcqOriginalCount = String(originalIds.length);


    const hasOptions = !!mcqContainer.querySelector('.mcq-option');
    if (!hasOptions) {
        // Show a small convert button instead of the full toolbar
        if (!subContent.querySelector('.mcq-convert-btn')) {
            const convertBtn = document.createElement('button');
            convertBtn.type = 'button';
            convertBtn.className = 'mcq-convert-btn';
            convertBtn.textContent = 'Add Multiple-Choice Options';
            convertBtn.addEventListener('click', () => {
                addMcqOption(mcqContainer);
                renumberLetters(mcqContainer);
                setUniformMcqLetterWidth(mcqContainer); // ← NEW
                convertBtn.remove();           // swap to full toolbar after first option
                makeOptionsInteractive(mcqContainer);
                // then create the normal toolbar:
                const toolbar = document.createElement('div');
                toolbar.className = 'mcq-edit-toolbar';
                const addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.textContent = 'Add New Multiple-Choice Option';
                addBtn.className = 'mcq-convert-btn';
                addBtn.addEventListener('click', () => {
                    addMcqOption(mcqContainer);
                    renumberLetters(mcqContainer);
                    setUniformMcqLetterWidth(mcqContainer); // ← NEW
                });
                toolbar.appendChild(addBtn);
                subContent.appendChild(toolbar);
            });
            subContent.appendChild(convertBtn);
        }
        return; // don’t build the full toolbar yet
    }


    // Add toolbar (Add Option)
    if (!subContent.querySelector('.mcq-edit-toolbar')) {
        const toolbar = document.createElement('div');
        toolbar.className = 'mcq-edit-toolbar';

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.textContent = 'Add New Multiple-Choice Option';
        addBtn.className = 'mcq-convert-btn';
        addBtn.addEventListener('click', () => {
            addMcqOption(mcqContainer);
            renumberLetters(mcqContainer);
        });

        toolbar.appendChild(addBtn);
        subContent.appendChild(toolbar);
    }

    // Make existing items draggable and show delete buttons
    makeOptionsInteractive(mcqContainer);
    setUniformMcqLetterWidth(mcqContainer); // ← NEW


    // Drag-and-drop plumbing
    // (Store handler refs on the container so we can remove them on teardown)
    if (mcqContainer._dragoverHandler) {
        mcqContainer.removeEventListener('dragover', mcqContainer._dragoverHandler);
    }
    if (mcqContainer._dropHandler) {
        mcqContainer.removeEventListener('drop', mcqContainer._dropHandler);
    }

    mcqContainer._dragoverHandler = (e) => {
        e.preventDefault();
        const dragging = mcqContainer.querySelector('.dragging');
        if (!dragging) return;

        const afterElement = getDragAfterElement(mcqContainer, e.clientY);
        if (afterElement == null) {
            mcqContainer.appendChild(dragging);
        } else {
            mcqContainer.insertBefore(dragging, afterElement);
        }
    };
    mcqContainer._dropHandler = () => {
        const dragging = mcqContainer.querySelector('.dragging');
        if (dragging) dragging.classList.remove('dragging');
        renumberLetters(mcqContainer);
    };

    mcqContainer.addEventListener('dragover', mcqContainer._dragoverHandler);
    mcqContainer.addEventListener('drop', mcqContainer._dropHandler);

}

function clearMcqSnapshotData(container) {
    if (!container) return;
    delete container.dataset.mcqHadContainer;
    delete container.dataset.mcqOriginalHtml;
    delete container.dataset.originalMcqIds;
    delete container.dataset.mcqSnapshotTaken;
    delete container.dataset.mcqOriginalCount;
}

function restoreMcqSnapshot(container) {
    const subContent = container.querySelector('.sub-question-content');
    if (!subContent) return;

    const hadContainer = container.dataset.mcqHadContainer === '1';
    const originalHtml = container.dataset.mcqOriginalHtml ?? '';

    let mcqContainer = subContent.querySelector('.mcq-options');

    if (hadContainer) {
        if (!mcqContainer) {
            mcqContainer = document.createElement('div');
            mcqContainer.className = 'mcq-options';
            subContent.appendChild(mcqContainer);
        }
        mcqContainer.innerHTML = originalHtml;   // ← bring back exactly what was there
    } else {
        // There wasn't a container before edit; remove any we added
        if (mcqContainer) mcqContainer.remove();
    }

    clearMcqSnapshotData(container);
}


/**
 * Remove edit-only controls/attrs for MCQs
 */
function teardownMcqEditingUI(container) {
    const subContent = container.querySelector('.sub-question-content');
    if (!subContent) return;

    // Remove the lightweight convert button (for zero-options state)
    const convertBtn = subContent.querySelector('.mcq-convert-btn');
    if (convertBtn) convertBtn.remove();

    // Remove the full toolbar
    const toolbar = subContent.querySelector('.mcq-edit-toolbar');
    if (toolbar) toolbar.remove();

    const mcqContainer = subContent.querySelector('.mcq-options');
    if (!mcqContainer) {
        delete container.dataset.originalMcqIds;
        return;
    }

    // Detach DnD listeners that were attached in setup
    if (mcqContainer._dragoverHandler) {
        mcqContainer.removeEventListener('dragover', mcqContainer._dragoverHandler);
        delete mcqContainer._dragoverHandler;
    }
    if (mcqContainer._dropHandler) {
        mcqContainer.removeEventListener('drop', mcqContainer._dropHandler);
        delete mcqContainer._dropHandler;
    }

    // Strip edit-only affordances from each option
    mcqContainer.querySelectorAll('.mcq-option').forEach((opt) => {
        opt.removeAttribute('draggable');
        opt.classList.remove('dragging');
        const handle = opt.querySelector('.drag-handle');
        if (handle) handle.remove();
        const del = opt.querySelector('.mcq-delete-btn');
        if (del) del.remove();
    });

    if (mcqContainer) {
        mcqContainer.style.removeProperty('--mcq-letter-col'); // ← NEW
    }

    delete container.dataset.originalMcqIds;
}

function cleanupMcqDomAfterCancel(container) {
    const subContent = container.querySelector('.sub-question-content');
    if (!subContent) return;

    const mcqContainer = subContent.querySelector('.mcq-options');
    if (!mcqContainer) return;

    // Remove any options created during this edit session (they won't have db ids)
    mcqContainer.querySelectorAll('.mcq-option').forEach((opt) => {
        if (!opt.dataset.mcqOptionId) {
            opt.remove();
        }
    });

    // If there were originally no options, and none remain now, remove the container (optional)
    const originalIds = JSON.parse(container.dataset.originalMcqIds || '[]');
    const stillHasOption = !!mcqContainer.querySelector('.mcq-option');
    if (originalIds.length === 0 && !stillHasOption) {
        mcqContainer.remove();
    }

    // Clean up flags
    delete container.dataset.originalMcqIds;
    delete container.dataset.mcqHadContainer;
    delete container.dataset.mcqOriginalCount;
}



/**
 * Add drag + delete affordances for each existing .mcq-option (and convert content into inputs if needed)
 */
function makeOptionsInteractive(mcqContainer) {
    Array.from(mcqContainer.querySelectorAll('.mcq-option')).forEach((opt) => {
        // Drag handle (added only once)
        if (!opt.querySelector('.drag-handle')) {
            const handle = document.createElement('span');
            handle.className = 'drag-handle';
            handle.textContent = '⋮⋮';
            handle.title = 'Drag to reorder';
            handle.style.cursor = 'grab';
            opt.insertBefore(handle, opt.firstChild);
        }

        // Delete button (added only once)
        if (!opt.querySelector('.mcq-delete-btn')) {
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'mcq-delete-btn';
            del.textContent = '×';
            del.addEventListener('click', () => {
                opt.remove();
                renumberLetters(mcqContainer);
                setUniformMcqLetterWidth(mcqContainer); // ← NEW
            });
            opt.appendChild(del);
        }

        // Make draggable
        opt.setAttribute('draggable', 'true');
        opt.addEventListener('dragstart', () => {
            opt.classList.add('dragging');
        });
        opt.addEventListener('dragend', () => {
            opt.classList.remove('dragging');
        });

        // Ensure the letter element has the expected class for renumbering
        let letterEl = opt.querySelector('.mcq-letter');
        if (!letterEl) {
            letterEl = opt.querySelector('strong') || document.createElement('strong');
            letterEl.className = 'mcq-letter';
            if (!letterEl.parentElement) opt.insertBefore(letterEl, opt.children[1] || null);
        }
    });
}

/**
 * Create a new MCQ option row with an editable input immediately
 */
function addMcqOption(mcqContainer) {
    const opt = document.createElement('div');
    opt.className = 'mcq-option';
    // no dataset id => treated as new on save
    const letterStrong = document.createElement('strong');
    letterStrong.className = 'mcq-letter';
    letterStrong.textContent = '?';

    const contentWrapper = document.createElement('span');
    contentWrapper.className = 'formatted-text';
    contentWrapper.dataset.editable = 'mcq_content';

    const input = document.createElement('input');
    input.className = 'editable-input';
    input.type = "text";
    input.placeholder = 'Option text...';
    contentWrapper.appendChild(input);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'mcq-delete-btn';
    del.textContent = '×';
    del.addEventListener('click', () => {
        opt.remove();
        renumberLetters(mcqContainer);
    });

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⋮⋮';
    handle.title = 'Drag to reorder';
    handle.style.cursor = 'grab';

    opt.appendChild(handle);
    opt.appendChild(letterStrong);
    opt.appendChild(contentWrapper);
    opt.appendChild(del);

    opt.setAttribute('draggable', 'true');
    opt.addEventListener('dragstart', () => opt.classList.add('dragging'));
    opt.addEventListener('dragend', () => opt.classList.remove('dragging'));

    mcqContainer.appendChild(opt);
}

function setUniformMcqLetterWidth(mcqContainer) {
    const letters = Array.from(mcqContainer.querySelectorAll('.mcq-letter'));
    if (!letters.length) return;

    // Clear any previous inline width so we measure natural width
    letters.forEach(el => (el.style.width = ''));

    // A few extra pixels for breathing room
    const px = 20;
    mcqContainer.style.setProperty('--mcq-letter-col', `${px}px`);
}


/**
 * Renumber letters by current DOM order (A, B, C... AA...)
 */
function renumberLetters(mcqContainer) {
    const toLetter = (i) => {
        let s = ''; i += 1;
        while (i > 0) {
            const rem = (i - 1) % 26;
            s = String.fromCharCode(65 + rem) + s;
            i = Math.floor((i - 1) / 26);
        }
        return s;
    };

    Array.from(mcqContainer.querySelectorAll('.mcq-option')).forEach((opt, idx) => {
        const letterEl = opt.querySelector('.mcq-letter');
        if (letterEl) letterEl.textContent = `${toLetter(idx)}:`;
    });
}


/**
 * Find where to insert the dragged element based on mouse Y
 */
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.mcq-option:not(.dragging)')];
    return draggableElements.reduce(
        (closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            } else {
                return closest;
            }
        },
        { offset: Number.NEGATIVE_INFINITY, element: null }
    ).element;
}


