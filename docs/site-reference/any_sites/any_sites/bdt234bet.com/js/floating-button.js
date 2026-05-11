document.addEventListener('DOMContentLoaded', function() {
    const floatBtn = document.getElementById('bdt234FloatBtn');
    const modalOverlay = document.getElementById('bdt234ModalOverlay');
    const modalClose = document.getElementById('bdt234ModalClose');
    
    if (floatBtn && modalOverlay) {
        floatBtn.addEventListener('click', function() {
            modalOverlay.classList.add('bdt234-active');
            document.body.style.overflow = 'hidden';
        });
    }
    
    if (modalClose && modalOverlay) {
        modalClose.addEventListener('click', function() {
            modalOverlay.classList.remove('bdt234-active');
            document.body.style.overflow = '';
        });
    }
    
    if (modalOverlay) {
        modalOverlay.addEventListener('click', function(e) {
            if (e.target === modalOverlay) {
                modalOverlay.classList.remove('bdt234-active');
                document.body.style.overflow = '';
            }
        });
    }
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('bdt234-active')) {
            modalOverlay.classList.remove('bdt234-active');
            document.body.style.overflow = '';
        }
    });
});