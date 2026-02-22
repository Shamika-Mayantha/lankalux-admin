# LankaLux Itinerary Photos

This directory contains photos that will appear in the public itinerary links.

## Directory Structure

Place your photos directly in this `public/images/` directory. The AI will automatically match photos to locations and activities based on the `photo-mapping.json` file.

## Photo Naming Convention

### Location Photos (Primary)
- `colombo.jpg` - Primary image for Colombo
- `sigiriya.jpg` - Primary image for Sigiriya
- `ella.jpg` - Primary image for Ella
- `yala.jpg` - Primary image for Yala
- `galle.jpg` - Primary image for Galle
- `kandy.jpg` - Primary image for Kandy
- `nuwara-eliya.jpg` - Primary image for Nuwara Eliya
- `placeholder.jpg` - Default placeholder image (required)

### Alternative Location Photos
You can add alternative photos for each location:
- `colombo-city.jpg`, `colombo-beach.jpg`, `colombo-temple.jpg`
- `sigiriya-rock.jpg`, `sigiriya-frescoes.jpg`, `sigiriya-view.jpg`
- `ella-train.jpg`, `ella-tea.jpg`, `ella-mountains.jpg`
- `yala-safari.jpg`, `yala-leopard.jpg`, `yala-elephant.jpg`
- `galle-fort.jpg`, `galle-beach.jpg`, `galle-lighthouse.jpg`
- `kandy-temple.jpg`, `kandy-lake.jpg`, `kandy-dance.jpg`
- `nuwara-eliya-tea.jpg`, `nuwara-eliya-golf.jpg`, `nuwara-eliya-waterfall.jpg`

### Activity Photos
Photos for specific activities:
- `safari-jeep.jpg` - Safari/wildlife activities
- `temple-visit.jpg` - Temple visits
- `beach-relaxation.jpg` - Beach activities
- `tea-plantation.jpg` - Tea-related activities
- `train-journey.jpg` - Train journeys
- `hiking-trail.jpg` - Hiking/trekking
- `dining-experience.jpg` - Dining/restaurants
- `restaurant.jpg` - Restaurant settings
- `spa-treatment.jpg` - Spa/wellness
- `wellness.jpg` - Wellness activities

## How It Works

1. **Photo Mapping**: The `photo-mapping.json` file maps photos to locations and activities
2. **AI Selection**: When generating itineraries, the AI reads this mapping and intelligently selects the most appropriate photo for each day based on:
   - Location name (primary match)
   - Main activities (keyword matching)
   - Day title/theme (contextual matching)
3. **Display**: The public itinerary page displays the AI-selected photo, with fallback to location-based photos if needed

## Updating Photo Mapping

To add new photos or update the mapping:

1. **Add your photos** to this directory with appropriate names
2. **Edit `photo-mapping.json`** to include:
   - New location entries with `primary_image` and `alternative_images`
   - New activity entries with `images` array
   - Keywords that help the AI match photos to content

## Photo Requirements

- **Format**: JPG, PNG, or WebP
- **Recommended Size**: 1200x800px or larger (16:9 aspect ratio works best)
- **File Size**: Optimize images for web (under 500KB recommended)
- **Quality**: High-quality, professional photos that represent Sri Lanka well

## Example: Adding a New Location Photo

1. Add the photo file: `public/images/new-location.jpg`
2. Update `photo-mapping.json`:
```json
"New Location": {
  "primary_image": "/images/new-location.jpg",
  "alternative_images": [
    "/images/new-location-alt1.jpg",
    "/images/new-location-alt2.jpg"
  ],
  "keywords": ["new location", "keyword1", "keyword2"]
}
```

The AI will automatically use these photos when generating itineraries that include this location!
