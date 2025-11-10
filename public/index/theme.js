function setTheme(isLight) {
    document.body.classList.toggle("light-theme", isLight);

    const themeIcons = document.querySelectorAll("#theme-icon, #mobile-theme-icon");
    themeIcons.forEach(icon => {
        icon.src = isLight ? "../assets/moon-icon.svg" : "../assets/sun-icon.svg";
    });

    const headerLogo = document.getElementById("header-logo");
    if (headerLogo) headerLogo.src = isLight ? "../assets/playlistconverter-logo-b.png" : "../assets/playlistconverter-logo-w.png";
    const siteLogo = document.getElementById("site-logo");
    if (siteLogo) siteLogo.src = isLight ? "../assets/playlistconverter-logo-b.png" : "../assets/playlistconverter-logo-w.png";

    localStorage.setItem("theme", isLight ? "light" : "dark");
}

function applySavedTheme() {
    const isLight = localStorage.getItem("theme") === "light";
    setTheme(isLight);
    document.body.classList.remove("preload");
}

applySavedTheme();

function setupThemeButtons() {
    const themeBtns = document.querySelectorAll(".theme-toggle, #theme-btn, #mobile-theme-btn");
    themeBtns.forEach(btn => {
        btn.addEventListener("click", function() {
            const isLight = !document.body.classList.contains("light-theme");
            setTheme(isLight);
        });
    });
}

setupThemeButtons();