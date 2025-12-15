

document.addEventListener("DOMContentLoaded", function(event){
    const body = document.getElementsByTagName("body");
    let element = body[0].appendChild(document.createElement("div"));
    element.style.width = "100%";
    element.style.height = "100%";
    element.style.position = "relative";
    element.id = "heatmapContainer";

    const head = document.getElementsByTagName("head")[0];
    let scriptElement = head.appendChild(document.createElement("script"));
    scriptElement.src = "https://cdn.jsdelivr.net/npm/heatmapjs@2.0.5/heatmap.min.js";

    scriptElement.onload = function() {
        const heatmapInstance = h337.create({
            container: document.getElementById("heatmapContainer"),
            radius: 30,
            maxOpacity: 0.6,
            minOpacity: 0,
            blur: 0.85,
            gradient: {
                0.4: "blue",
                0.6: "lime",
                0.8: "orange",
                1.0: "red"
            }
        });

        // Ajouter un clic pour tester
        document.addEventListener("click", function(event) {
            heatmapInstance.addData({ x: event.clientX, y: event.clientY, value: 1 });
        });
    };
})