import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from './Icon';
import type { ProductImageRef } from '../types/store';

// Real image when a uri exists; otherwise a tinted placeholder with a shirt glyph (dev data
// has no photography). Decorative — the card/screen carries the accessibility label.
export function ProductImage({ image, style, iconSize = 44 }: { image: ProductImageRef; style?: StyleProp<ViewStyle>; iconSize?: number }) {
  if (image.uri) {
    return (
      <View style={[styles.fill, style]}>
        <Image source={{ uri: image.uri }} style={styles.fill} resizeMode="cover" accessibilityIgnoresInvertColors />
      </View>
    );
  }
  return (
    <View style={[styles.fill, styles.center, style]}>
      <LinearGradient colors={[`${image.tint}CC`, `${image.tint}33`, 'rgba(25,27,31,0.9)']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <Icon name="tshirt" size={iconSize} color="rgba(255,255,255,0.85)" />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { width: '100%', height: '100%' }, center: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } });
