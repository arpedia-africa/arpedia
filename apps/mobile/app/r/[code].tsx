import { Redirect, useLocalSearchParams } from 'expo-router';

// Flow 07 rule 9: the invite link arpedia.africa/r/CODE (and arpedia://r/CODE) opens s-join-code
// with the code filled in.
export default function RoomLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Redirect href={{ pathname: '/join-code', params: { code: code ?? '' } }} />;
}
