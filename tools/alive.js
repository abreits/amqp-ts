// simple tool that keeps the development docker container from closing

console.log("Starting alive at " + new Date().toLocaleString());

setInterval(function() {
    console.log("Still alive at " + new Date().toLocaleString());
}, 60000)