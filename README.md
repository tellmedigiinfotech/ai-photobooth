# AI Photobooth

A stunning web-based AI photobooth application that captures photos, applies AI transformations with iconic Indian monument backgrounds, and provides instant printing.

## Features

- 📸 **Webcam Integration** - High-quality camera capture
- 🎨 **8 Preset Backgrounds** - Iconic Indian monuments (Taj Mahal, Red Fort, Mysore Palace, etc.)
- ✨ **AI Image Generation** - Powered by Google's Imagen API
- 🖨️ **Instant Printing** - One-click print functionality
- 🎭 **Beautiful UI** - Modern dark theme with glassmorphism effects

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Key (Optional for Testing)

The application works in mock mode without an API key. To enable actual AI generation:

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Google API key:
   ```
   GOOGLE_API_KEY=your_actual_api_key_here
   ```

### 3. Start the Server

```bash
npm start
```

The application will be available at `http://localhost:3000`

## Usage

1. **Start Camera** - Click to activate your webcam
2. **Capture Photo** - Take a photo when ready
3. **Select Preset** - Choose from 8 monument backgrounds
4. **Generate AI Image** - Click to create your AI-enhanced photo
5. **Print** - Print your masterpiece!

## Project Structure

```
AI photobooth/
├── index.html          # Main HTML structure
├── styles.css          # Styling and animations
├── app.js             # Frontend JavaScript logic
├── server.js          # Backend Express server
├── package.json       # Dependencies
├── .env.example       # Environment template
└── assets/
    └── backgrounds/   # Monument background images
```

## Presets

1. **Royal Palace** - Majestic palace with royal attire
2. **Taj Mahal** - Iconic monument backdrop
3. **Jaipur Fort** - Rajasthani grandeur
4. **Gateway of India** - Mumbai landmark
5. **Mysore Palace** - South Indian royalty
6. **Red Fort** - Historic Delhi monument
7. **Hawa Mahal** - Palace of Winds
8. **Amber Fort** - Hilltop fortress

## API Integration

The application is designed to work with Google's Imagen API. The server endpoint at `/api/generate` accepts:

- `userImage` - The captured photo
- `backgroundImage` - Selected monument background
- `prompt` - AI generation instructions

### Mock Mode

Without an API key, the application returns the original captured image as a placeholder, allowing you to test the entire flow.

## Customization

### Adding New Presets

Edit `app.js` and add to the `presets` array:

```javascript
{
    id: 9,
    name: 'Your Monument',
    description: 'Description here',
    prompt: 'Your AI prompt here',
    backgroundUrl: 'assets/backgrounds/your-image.jpg'
}
```

### Styling

Modify `styles.css` to customize colors, fonts, and animations. The design uses CSS custom properties for easy theming.

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari

Requires webcam access permissions.

## Troubleshooting

### Camera Not Working
- Check browser permissions
- Ensure HTTPS or localhost
- Try a different browser

### API Errors
- Verify API key in `.env`
- Check API endpoint URL
- Review server console logs

### Images Not Loading
- Check `assets/backgrounds/` folder
- Verify image file names match presets
- Check browser console for errors

## License

MIT

## Support

For issues or questions, please check the server console logs for detailed error messages.
