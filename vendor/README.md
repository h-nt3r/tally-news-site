# template/vendor/

Third-party code the site ships with, copied here so the site never loads code from anyone else's server.

- `hls.min.js`: hls.js 1.5.17 (Apache-2.0, license in `LICENSE-hls.js.txt`). It plays HLS video, the format Bluesky uses, in browsers that
  can't play it natively (Safari can). It is only loaded when a reader taps a clip, and it only talks to the address of that one clip.
  Source: https://github.com/video-dev/hls.js
