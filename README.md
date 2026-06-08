# YTBackground v1.0.0

A lightweight, dependency-free Vanilla JavaScript library to use YouTube videos as dynamic backgrounds with a perfect **object-fit: cover** effect.

## ✨ Features

- **Perfect Cover:** Uses mathematical calculations to ensure the video always covers the container without black bars, regardless of aspect ratio.
- **Zero Dependencies:** Pure Vanilla JS, no jQuery required.
- **Auto-Init:** Initialize videos automatically using HTML5 `data-attributes`.
- **Smart Performance:** Debounced resizing and passive event listeners for smooth performance.
- **Programmatic API:** Full control over play, pause, mute, and video swapping.
- **Overlay Support:** Built-in support for customizable dark overlays for better text readability.

## 🚀 Installation

Include the script in your HTML file:

```html
<script src="path/to/ytbackground.min.js"></script>
```

## 🛠 Usage

### 1. Declarative Method (HTML)
Simply add the `data-yt-bg-id` attribute to any element. The library will handle the rest automatically.

```html
<div 
  class="hero-section" 
  data-yt-bg-id="dQw4w9WgXcQ"
  data-yt-bg-mute="true"
  data-yt-bg-overlay="0.4"
>
  <h1>Content above video</h1>
</div>
```

### 2. Programmatic Method (JavaScript)
For more control or dynamic initialization:

```javascript
const myBg = new YTBackground('#my-element', {
  videoId: 'dQw4w9WgXcQ',
  mute: true,
  loop: true,
  overlay: 0.2,
  onReady: (event, instance) => {
    console.log("Video is ready!");
  }
});
```

## ⚙️ Configuration Options

| Option | Data Attribute | Default | Description |
| :--- | :--- | :--- | :--- |
| `videoId` | `data-yt-bg-id` | `null` | **Required.** The YouTube Video ID. |
| `mute` | `data-yt-bg-mute` | `true` | Mutes the audio (required for autoplay in most browsers). |
| `loop` | `data-yt-bg-loop` | `true` | Restarts the video when it ends. |
| `start` | `data-yt-bg-start` | `0` | Seconds to start the video from. |
| `controls` | `data-yt-bg-controls` | `false` | Show or hide YouTube player controls. |
| `overlay` | `data-yt-bg-overlay` | `0` | Opacity of a black overlay (0 to 1). |
| `quality` | `data-yt-bg-quality` | `'hd1080'` | Suggested playback quality. |
| `autoplay` | `data-yt-bg-autoplay` | `true` | Start playback automatically. |

## 🕹 API Methods

Once an instance is created, you can control it using these methods:

- `instance.play()`: Resumes video playback.
- `instance.pause()`: Pauses the video.
- `instance.mute()` / `instance.unmute()`: Toggles audio.
- `instance.changeVideo(newId)`: Swaps the current video with a new one.
- `instance.resize()`: Manually triggers a recalculation of dimensions.
- `instance.destroy()`: Removes the player and cleans up the DOM.

## 🧪 Advanced Control

You can interact with all active instances via the static registry:

```javascript
// Get all active instances
const instances = YTBackground.getInstances();

// Destroy all instances
YTBackground.destroyAll();
```

## 📄 Requirements

- A modern browser with ES6 support.
- YouTube IFrame API (automatically loaded by the library).

## 📝 License

This project is licensed under the **MIT License**.

## 👨‍💻 Author

Created by **Lorenzo Fornara**.

---
*Developed with precision for high-quality frontend experiences.*