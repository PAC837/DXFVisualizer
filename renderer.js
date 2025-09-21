document.addEventListener('DOMContentLoaded', function() {
    const heyButton = document.getElementById('heyButton');
    const messageDiv = document.getElementById('message');
    
    heyButton.addEventListener('click', function() {
        messageDiv.textContent = 'world';
        messageDiv.style.display = 'block';
    });
});
