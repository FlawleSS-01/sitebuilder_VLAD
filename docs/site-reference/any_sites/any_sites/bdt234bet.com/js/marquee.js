document.addEventListener('DOMContentLoaded', function() {
    const sliderTrack = document.getElementById('bdt234SliderTrack');
    const messageList = document.querySelector('.bdt234-message-list');
    
    if (messageList && sliderTrack) {
        const duplicateList = messageList.cloneNode(true);
        sliderTrack.appendChild(duplicateList);
    }
    
    const appButton = document.getElementById('bdt234AppBtn');
    if (appButton) {
        appButton.addEventListener('click', function() {
            window.open('https://bdt234.com', '_blank', 'nofollow sponsored');
        });
    }
});