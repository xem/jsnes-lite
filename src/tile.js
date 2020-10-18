// Tile
// ====
var Tile = {

  // Tile decoding
  // A tile is encoded on 16 bytes
  // Each pixel is encoded on 2 bits
  // The first 8 bytes encode the low bit of every pixel
  // The last 8 bytes encode the high bit of every pixel
  decode: (tile, chr_rom, position) => {

    var i, j, byte1, byte2;

    // For each line k
    for(i = 0; i < 8; i++){
      
      // Read two bytes
      byte1 = chr_rom[position * 16 + i];
      byte2 = chr_rom[position * 16 + i + 8];
      
      // For each pixel l
      for(j = 0; j < 8; j++){
        
        // Set its color
        tile.pixels[i * 8 + j] = ((byte2 >> (7 - j)) & 1) * 2 + ((byte1 >> (7 - j)) & 1);
      }
    }
  },

  // draw a sprite on the current frameframebuffer, with a given position and palette
  // The palette has 16 colors, but a sprite can only use a subgroup of 4 colors, so an offset (0, 4, 8 or 12) is provided 
  // The sprite can be flipped horizontally and/or vertically
  // The sprite's pixels are only drawn if its OAM priority is lower than the OAM priority of the sprite pixels alreay drawn,
  // and if the PPU's priority bit puts it above the background tiles
  // Tile function is called twice when drawing a 8*16px sprite
  draw_sprite: (tile, framebuffer, srcy1, srcy2, x, y, palette, palette_offset, h_flip, v_flip, priority, priority_table) => {
    
    var pixel_index, pixel_index_in_tile, pixel_value, drawn_pixel_priority, i, j;
    
    // Don't draw off-screen tiles
    if(x < -7 || x >= 256 || y < -7 || y >= 240){
      return;
    }

    // Pixel index on screen (0-61440)
    pixel_index = y * 256 + x;
    
    // Pixel index inside the tile (0-63)
    // Start at different indices depending on tile flip
    pixel_index_in_tile = h_flip && v_flip ? 63 : v_flip ? 56 : h_flip ? 7 : 0;

    // For each pixel of the tile
    for(i = 0; i < 8; i++){
      for(j = 0; j < 8; j++){
        
        // Draw the requested lines only
        if(i >= srcy1 && i < srcy2){
        
          // Get the pixel's value (0-3, 0 = transparent)
          pixel_value = tile.pixels[pixel_index_in_tile];
          
          // Get the priority of the pixels already drawn on the screen
          drawn_pixel_priority = priority_table[pixel_index];
          
          // If pixel is not transparent and OAM priority is lower than the OAM priority of the pixel already drawn
          if(pixel_value > 0 && priority <= drawn_pixel_priority & 0xff){
            
            // Add the pixel to the framebuffer
            // The color is picked in the 16-color palette, among the 4 colors that follow the palette_offset
            framebuffer[pixel_index] = palette[pixel_value + palette_offset];
            
            // Save tile priority in priority table
            priority_table[pixel_index] = (priority_table[pixel_index] & 0xf00) | priority;
          }
        }

        pixel_index++;

        // Handle flips
        if(h_flip){
          pixel_index_in_tile--;
        }
        else {
          pixel_index_in_tile++;
        }
      }
      
      // Add 256 pixels (jump one line) and remove 8 (go back to the left side of the tile)
      pixel_index += 256 - 8;
      
      // Handle flips
      if(!v_flip && h_flip){
        pixel_index_in_tile += 16;
      }
      else if(v_flip && !h_flip){
        pixel_index_in_tile -= 16;
      }
    }
  }
}