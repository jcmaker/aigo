import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Image, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { deleteScenePhoto, listScenePhotos, type ScenePhoto } from '@/lib/scene-store';

export default function ScenePhotosScreen() {
  const [photos, setPhotos] = useState<ScenePhoto[] | null>(null);
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
  return (
    <FlatList
      data={photos}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ padding: 24, gap: 16 }}
      ListEmptyComponent={<Text>저장된 사진이 없습니다.</Text>}
      renderItem={({ item }) => (
        <View style={{ gap: 8 }}>
          <Image source={{ uri: item.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 8 }} />
          <Text>{new Date(item.takenAt).toLocaleString('ko-KR')}</Text>
          <Text>{item.location ? `위치 ${item.location.lat.toFixed(5)}, ${item.location.lng.toFixed(5)}` : '위치 정보 없음'}</Text>
          <Button label="공유" secondary onPress={() => share(item)} />
          <Button label="삭제" secondary onPress={() => remove(item)} />
        </View>
      )}
    />
  );
}
