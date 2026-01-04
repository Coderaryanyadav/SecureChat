# GhostChat: The Discord Replica Guide

This project has been engineered to be a pixel-perfect functional replica of the **Discord UI**, while maintaining the core secure, end-to-end encrypted backend of GhostChat.

## 🎨 Design Philosophy
The "Replica" status is achieved through three main pillars: **Layout Architecture**, **Visual Identity**, and **Interactive Flow**.

### 1. The Three-Column Layout
We mirror Discord’s vertical-slice architecture exactly:
-   **Column 1: The Server Rail (72px)**: A slim vertical navigation bar containing the Home icon (Discord Logo) and the "Add Room" (⊕) button. This is where high-level navigation lives.
-   **Column 2: The Channel Sidebar (240px)**: A secondary navigation area where Dimension Rooms are listed as `# text-channels`. It also features the **User Control Area** at the bottom, mimicking Discord’s status bar with your avatar, username, and settings.
-   **Column 3: The Message Canvas (Flexible)**: The main interaction area where messages flow. It uses the "Block-Message" style rather than "Bubble-Message" style.

### 2. The Visual Palette (Official Discord Colors)
We use the exact hex codes from the Discord design system:
-   **Blurple**: `#5865F2` (Primary actions and headers)
-   **Dark Primary**: `#313338` (Message canvas background)
-   **Dark Secondary**: `#2B2D31` (Sidebar background)
-   **Dark Tertiary**: `#1E1F22` (Server rail background)
-   **Green (Online)**: `#23A559` (Status indicators)
-   **Red (Critical)**: `#DA373C` (Purge/Logout actions)

### 3. Structural Replicas
-   **Message Grouping**: Messages are rendered with a fixed avatar on the left, an author-timestamp header, and content directly below. Hovers trigger a subtle background tint, exactly like Discord.
-   **Channel Navigation**: Rooms are prefixed with a `#` hash. Selecting a room "activates" it with a specific background highlight (`modifier-selected`).
-   **Input HUD**: The input bar is a floating-style rounded box nested within the canvas, utilizing the `#383a40` background tone.

## 🛠️ Technical Implementation
-   **Typography**: We utilize `ABC Ginto Nord` (fallback to `Inter`) to capture Discord's signature weight.
-   **Sensory Staggering**: WebSocket messages are pushed into the canvas with a `flex-direction: column` flow that preserves the feeling of an infinite scroll-up.
-   **Dynamic Avatars**: Every user is assigned a color based on a hash of their username, ensuring that even without uploaded avatars, the UI feels vibrant and recognizable.

## 🚀 How to maintain the Replica feel
When adding new features, follow the `Discord Palette` tokens defined in `static/style.css`. Always use `4px` or `8px` increments for padding and border-radii, as Discord follows a strict grid system.
