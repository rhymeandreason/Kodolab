/* The shared lab UI's words, in English: the top bar, the card, the timeline, Watch mode.
 * A classic script page.js loads before any module; a translation is strings.<lang>.js
 * beside it, LabText.add('<lang>', { ui: { … } }) with only the keys it translates.
 * {name} is filled in by the code. Markup allowed: <b>, <i>. */
LabText.add('en', {
  ui: {
    // top bar and title card (page.js)
    resetView: 'Reset view',
    about: 'About this experiment',
    restartLab: 'Restart lab',
    close: 'Close',
    start: 'Start the experiment',
    loading: 'Setting up the bench…',
    // modes and timeline (lesson.js)
    mode: 'Mode',
    handsOn: 'Hands-on',
    handsOnTip: 'Do the experiment yourself',
    handsOnHeld: 'Hands-on works in the Lab view',
    watch: 'Watch',
    watchTip: 'Watch the whole experiment play',
    play: 'Play',
    pause: 'Pause',
    playAgain: 'Play again',
    prevStep: 'Previous step',
    nextStep: 'Next step',
    replayStep: 'Restart this step',
    introCaption: 'Press <b>Play</b> to watch the experiment',
    // the card (lesson.js)
    procedure: 'Procedure',
    stepOf: 'Step {n} of {total}',
    timeLapse: 'Time-lapse',
    collapse: 'Collapse',
    expand: 'Expand',
    complete: 'Complete',
    labComplete: 'Lab complete',
    clickTo: 'Click to {action}',
    clickToUse: 'Click to use',
    alreadyDone: 'Already done for this step',
    notYet: 'Not yet: {hint}',
    // zoom circles (zoom.js)
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    zoomTo: '{dir} to the {level} level',
    // the card while zoomed in (createLesson's zoom option)
    levelWhy: '<b>{level} level:</b> {text}',
    backToLab: 'Click the <b>Lab</b> circle to go back to the bench and {action}',
    // the microscope view (microscope.js)
    scope: {
      back: 'Bench',
      focus: 'Focus',
      light: 'Light',
      scroll: 'scroll',
      total: '{n}× total',
      hints: {
        blurry: 'Blurry: scroll or use the focus slider',
        dark: 'Too dark: turn up the light',
        bright: 'Washed out: turn the light down',
      },
    },
  },
});
