function setTheme(isLight) {
  document.body.classList.toggle("light-theme", isLight);
  document.getElementById("theme-icon").src = isLight
    ? "https://cdn-icons-png.flaticon.com/512/6714/6714978.png"
    : "https://cdn-icons-png.flaticon.com/512/6714/6714976.png";
  localStorage.setItem("theme", isLight ? "light" : "dark");
}

function applySavedTheme() {
  const isLight = localStorage.getItem("theme") === "light";
  setTheme(isLight);
}

applySavedTheme();

document.getElementById("theme-btn").addEventListener("click", () => {
  const isLight = !document.body.classList.contains("light-theme");
  setTheme(isLight);
});

const map = L.map("map", { zoomControl: false }).setView([20, 0], 2);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "",
}).addTo(map);

const markers = [
  [48.8566, 2.3522],
  [40.7128, -74.006],
  [35.6895, 139.6917],
  [51.5074, -0.1278],
  [34.0522, -118.2437],
  [55.7558, 37.6173],
  [19.4326, -99.1332],
];

markers.forEach(([lat, lon]) => {
  L.circleMarker([lat, lon], {
    radius: 8,
    color: "#1db954",
    fillColor: "#1db954",
    fillOpacity: 0.8,
  }).addTo(map);
});