# Photo Setup Instructions for LankaLux Itineraries

## Quick Start

1. **Place your photos** in the `public/images/` directory
2. **Name them** according to the mapping in `photo-mapping.json`
3. **The AI will automatically** select and use appropriate photos when generating itineraries

## Where to Place Photos

All photos should be placed in:
```
public/images/
```

## Photo Mapping File

The `photo-mapping.json` file tells the AI which photos are available and how to match them. It contains:

1. **Location Photos**: Maps each location (Colombo, Sigiriya, Ella, etc.) to primary and alternative images
2. **Activity Photos**: Maps activity keywords (safari, temple, beach, etc.) to relevant images
3. **Keywords**: Help the AI match photos based on content

## How the AI Uses Photos

When generating an itinerary, the AI:
1. Reads the `photo-mapping.json` file
2. Analyzes each day's location, activities, and title
3. Selects the most appropriate photo based on:
   - Location name (primary match)
   - Activity keywords (secondary match)
   - Day theme/context (tertiary match)
4. Includes the selected image path in the itinerary JSON

## Required Photos

**Minimum required photos:**
- `placeholder.jpg` - Fallback image if no match is found

**Recommended location photos:**
- `colombo.jpg`, `sigiriya.jpg`, `ella.jpg`, `yala.jpg`, `galle.jpg`, `kandy.jpg`, `nuwara-eliya.jpg`

## Adding New Photos

1. **Add the photo file** to `public/images/` with a descriptive name
2. **Update `photo-mapping.json`**:
   - Add to `locations` if it's a location photo
   - Add to `activities` if it's an activity photo
   - Include relevant keywords for better matching

## Example Workflow

1. You have a photo of a tea plantation in Ella
2. Save it as `public/images/ella-tea-plantation.jpg`
3. Update `photo-mapping.json`:
   ```json
   "Ella": {
     "primary_image": "/images/ella.jpg",
     "alternative_images": [
       "/images/ella-train.jpg",
       "/images/ella-tea.jpg",
       "/images/ella-tea-plantation.jpg"  // Add your new photo
     ],
     "keywords": ["ella", "tea", "plantation", ...]
   }
   ```
4. The AI will now consider this photo when generating itineraries with tea-related activities in Ella

## Tips

- **Use descriptive filenames**: `kandy-temple-sunset.jpg` is better than `img123.jpg`
- **Add keywords**: More keywords = better AI matching
- **Multiple alternatives**: Provide 2-4 alternative images per location for variety
- **Optimize images**: Keep file sizes reasonable (under 500KB) for faster loading

## Testing

After adding photos:
1. Generate a new itinerary
2. Check the public itinerary link
3. Verify the AI selected appropriate photos
4. If needed, adjust keywords in `photo-mapping.json` and regenerate
