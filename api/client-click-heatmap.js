let click = [];

document.addEventListener("click", function (event){
    click.push({x: event.clientX, y: event.clientY})
});

window.addEventListener("unload", () => {
    navigator.sendBeacon("[SERVER]/heatmap/[HEATMAP ID]", JSON.stringify(click));
});