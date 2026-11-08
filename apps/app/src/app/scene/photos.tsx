import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { Button, Card, EmptyState, Screen, TopBar } from '@/components/ui';
import { deleteScenePhoto, listScenePhotos, type ScenePhoto } from '@/lib/scene-store';
import { color, radius, space, type } from '@/theme';

export default function ScenePhotosScreen() {
  const router = useRouter();
  const [photos, setPhotos] = useState<ScenePhoto[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const load = () => listScenePhotos().then(setPhotos);
  useEffect(() => void load(), []);

  const share = (p: ScenePhoto) =>
    Sharing.shareAsync(p.uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: '사진 공유' }).catch(() =>
      Alert.alert('공유하지 못했습니다.'),
    );

  const remove = (p: ScenePhoto) =>
    Alert.alert('사진을 삭제할까요?', '삭제하면 되돌릴 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => deleteScenePhoto(p.id).then(load, () => Alert.alert('삭제하지 못했습니다.')),
      },
    ]);

  if (!photos) return null;
  const selected = photos.find((p) => p.id === selectedId) ?? photos[0];
  return (
    <Screen scroll>
      <TopBar title="현장 사진" subtitle={`${photos.length}장`} onBack={() => router.back()} />
      {photos.length === 0 ? (
        <EmptyState icon="image" title="저장된 사진이 없습니다." />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[1] }}>
            {photos.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`사진 ${new Date(p.takenAt).toLocaleString('ko-KR')}`}
                accessibilityState={{ selected: p.id === selected.id }}
                onPress={() => setSelectedId(p.id)}
                style={{ width: '32.3%', aspectRatio: 1, borderRadius: radius.icon, overflow: 'hidden', borderWidth: 2, borderColor: p.id === selected.id ? color.brand : 'transparent' }}
              >
                <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} />
              </Pressable>
            ))}
          </View>
          <Card>
            <Text style={[type.label, { color: color.gray12 }]}>{new Date(selected.takenAt).toLocaleString('ko-KR')}</Text>
            <Text style={[type.caption, { color: color.gray11 }]}>
              {selected.location ? `위치 ${selected.location.lat.toFixed(5)}, ${selected.location.lng.toFixed(5)}` : '위치 정보 없음'}
            </Text>
            <View style={{ flexDirection: 'row', gap: space[3] }}>
              <View style={{ flex: 1 }}><Button label="공유" variant="secondary" size="md" icon="share" onPress={() => share(selected)} /></View>
              <View style={{ flex: 1 }}><Button label="삭제" variant="danger" size="md" icon="trash" onPress={() => remove(selected)} /></View>
            </View>
          </Card>
        </>
      )}
    </Screen>
  );
}
