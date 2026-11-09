import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';
import { Button, Card, Icon, TextField, type IconName } from '@/components/ui';
import { addContact, getContacts, MAX_CONTACTS, removeContact, type Contact } from '@/lib/scene-store';
import { color, radius, space, type } from '@/theme';

const RELATIONS = ['가족', '친구', '직장', '기타'];
const SMS_BODY = '[AIGO] 교통사고가 났어요. 확인하면 연락 부탁해요.';

function open(url: string, fallback: string) {
  Linking.openURL(url).catch(() => Alert.alert('앱을 열 수 없습니다.', fallback));
}
const call = (c: Contact) => open(`tel:${c.phone}`, `${c.phone}로 직접 전화해 주세요.`);
// iOS는 번호 뒤 &body=, Android는 ?body=를 쓴다.
const text = (c: Contact) => open(`sms:${c.phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(SMS_BODY)}`, `${c.phone}로 직접 문자를 보내 주세요.`);

function RoundButton({ icon, label, onPress, bg, fg }: { icon: IconName; label: string; onPress: () => void; bg: string; fg: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={18} color={fg} />
    </Pressable>
  );
}

function ContactRow({ c, editing, onRemove }: { c: Contact; editing: boolean; onRemove: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderWidth: 1, borderColor: color.gray4, borderRadius: radius.row, backgroundColor: color.white }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color.brand200, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[type.headline, { color: color.brand600 }]}>{c.name.slice(0, 1)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.label, { fontSize: 14, color: color.gray12 }]} numberOfLines={1}>{c.name}</Text>
        <Text style={[type.caption, { fontSize: 12, color: color.gray11 }]} numberOfLines={1}>{c.relation ? `${c.relation} · ${c.phone}` : c.phone}</Text>
      </View>
      {editing ? (
        <RoundButton icon="trash" label={`${c.name} 삭제`} onPress={onRemove} bg={color.danger300} fg={color.danger600} />
      ) : (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <RoundButton icon="message" label={`${c.name}에게 문자`} onPress={() => text(c)} bg={color.gray3} fg={color.ink} />
          <RoundButton icon="phone" label={`${c.name}에게 전화`} onPress={() => call(c)} bg={color.brand} fg={color.onBrand} />
        </View>
      )}
    </View>
  );
}

// 사고 현장 모드: 사고가 났을 때 알릴 사람(가족·지인). 로그인·인터넷 없이 폰에만 저장한다.
export function ContactsCard() {
  const [list, setList] = useState<Contact[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState(RELATIONS[0]);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getContacts().then(setList);
  }, []);

  const reset = () => {
    setAdding(false);
    setName('');
    setPhone('');
    setRelation(RELATIONS[0]);
    setError(null);
  };
  async function save() {
    try {
      setList(await addContact(name, relation, phone));
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    }
  }
  function remove(c: Contact) {
    Alert.alert(`${c.name}을(를) 지울까요?`, undefined, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => removeContact(c.id).then((next) => { setList(next); if (!next.length) setEditing(false); }) },
    ]);
  }

  const action = list.length && !adding ? { label: editing ? '완료' : '편집', onPress: () => setEditing(!editing) } : undefined;

  return (
    <Card title="알릴 사람" action={action}>
      {!list.length && !adding ? (
        <Text style={[type.caption, { color: color.gray11 }]}>사고가 났을 때 바로 연락할 사람을 저장해 두세요. 버튼 한 번으로 전화나 문자를 보낼 수 있어요.</Text>
      ) : null}
      {list.map((c) => <ContactRow key={c.id} c={c} editing={editing} onRemove={() => remove(c)} />)}

      {adding ? (
        <View style={{ gap: space[3], padding: space[3], borderRadius: radius.row, backgroundColor: color.gray2 }}>
          <TextField label="이름" value={name} onChangeText={setName} placeholder="엄마" maxLength={20} />
          <View style={{ gap: 6 }}>
            <Text style={[type.label, { fontSize: 12, color: color.gray11 }]}>관계</Text>
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              {RELATIONS.map((r) => {
                const on = r === relation;
                return (
                  <Pressable key={r} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setRelation(r)}
                    style={{ paddingHorizontal: space[4], height: 36, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: on ? color.ink : color.white, borderWidth: on ? 0 : 1, borderColor: color.gray4 }}>
                    <Text style={[type.label, { color: on ? color.white : color.gray11 }]}>{r}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <TextField label="전화번호" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="010-0000-0000" error={error} />
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Button style={{ flex: 1 }} label="취소" variant="secondary" size="md" onPress={reset} />
            <Button style={{ flex: 1 }} label="저장" size="md" onPress={save} />
          </View>
        </View>
      ) : list.length < MAX_CONTACTS && !editing ? (
        <Button label="연락처 추가" variant="secondary" size="md" icon="plus" onPress={() => setAdding(true)} />
      ) : null}
      <Text style={[type.micro, { color: color.gray9 }]}>연락처는 이 폰에만 저장되고 서버로 보내지 않아요. 최대 {MAX_CONTACTS}명.</Text>
    </Card>
  );
}
