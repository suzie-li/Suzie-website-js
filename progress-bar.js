let counter = {
  value: 0
};

function updateLoaderText() {
  let progress = Math.round (counter.value);
  $('.loading-number').text(progress);
}

let tl = {gsap.timeline({}); 
tl.to (counter, {
  onUpdate: updateLoaderText,
  value: 100,
  duration: 7
});
