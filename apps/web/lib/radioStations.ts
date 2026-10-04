export type OverlayRadioStation = {
  id: string;
  name: string;
  url: string;
  genre?: string;
  language?: string;
  bitrateKbps?: number;
};

/**
 * Radio stations bundled directly with the OpenHaul /overlay frontend.
 * Localhost / 127.0.0.1 entries are intentionally excluded.
 */
export const overlayRadioStations: OverlayRadioStation[] = [
  {
    "id": "seed-100-3-the-bear-edmonton-ab-0cf2d842",
    "name": "100.3 The Bear - Edmonton, AB",
    "url": "http://playerservices.streamtheworld.com/api/livestream?station=CFBRFM",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-100-3-the-q-victoria-bc-25052fd8",
    "name": "100.3 The Q - Victoria, BC",
    "url": "http://ais-sa1.streamon.fm/7333_48k.aac",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 48
  },
  {
    "id": "seed-101-smooth-jazz-e5acf65a",
    "name": "101 Smooth Jazz",
    "url": "https://jking.cdnstream1.com/b22139_128mp3",
    "genre": "Jazz, Easy Listening",
    "language": "EN",
    "bitrateKbps": 192
  },
  {
    "id": "seed-101-5-k-rock-a03ade67",
    "name": "101.5 K-Rock",
    "url": "https://stream-01.surfernetwork.com/drscz5r6naxuv?zt=eyJhbGciOiJIUzI1NiJ9.eyJzdHJlYW0iOiJkcnNjejVyNm5heHV2IiwiaG9zdCI6InN0cmVhbS0wMS5zdXJmZXJuZXR3b3JrLmNvbSIsInJ0dGwiOjUsImp0aSI6InpuNEVXMWd6Uy1lV1pnZXk2Mzk4SkEiLCJpYXQiOjE3ODAzMjc5MzEsImV4cCI6MTc4MDMyNzk5MX0.xXQkhWqy0s4P9_EXq6ciddGoPUfDg8YfgFU_eJI_6CU",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-101-7-kiss-fm-abb6d052",
    "name": "101.7 Kiss FM",
    "url": "https://ais-sa8.cdnstream1.com/1415_64",
    "genre": "Adult Contemporary",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-102-1-koky-e75b8409",
    "name": "102.1 KOKY",
    "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/KOKYFM.mp3?dist=onlineradiobox",
    "genre": "Adult Contemporary",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-102-1-the-edge-toronto-on-5b5e7766",
    "name": "102.1 The Edge - Toronto, ON",
    "url": "http://live.leanstream.co/CFNYFM-MP3",
    "genre": "Alternative Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-103-3-ed-fm-292c3a0d",
    "name": "103.3 eD-fm",
    "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/KDRFFM_SC?dist=onlineradiobox",
    "genre": "Adult Contemporary",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-104-3-the-party-c465f64d",
    "name": "104.3 The Party",
    "url": "https://cromwell-ice.streamguys1.com/WCBHFM",
    "genre": "Top40",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-104-9-virgin-radio-edmonton-ab-c7a46c79",
    "name": "104.9 Virgin Radio - Edmonton, AB",
    "url": "http://14023.live.streamtheworld.com/CFMGFM_SC",
    "genre": "Top40, Pop",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-106-7-rewind-radio-red-deer-ab-c48b8bab",
    "name": "106.7 Rewind Radio - Red Deer, AB",
    "url": "http://cfdv.streamon.fm:8000/CFDV-48k.aac",
    "genre": "Classic Hits",
    "language": "EN",
    "bitrateKbps": 48
  },
  {
    "id": "seed-107-the-zone-e7111839",
    "name": "107 The Zone",
    "url": "https://streaming.live365.com/a59291",
    "genre": "Top40",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-107dot5-2168031a",
    "name": "107dot5",
    "url": "https://www.tuneintoradio1.com/radio/8030/radio.mp3",
    "genre": "Rock, Grunge, Punk",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-113-fm-radio-96984c8f",
    "name": "113.FM RADIO",
    "url": "https://113fm.cdnstream1.com/1736_128?cb=139271.mp3",
    "genre": "Dance, Electronic",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-181-fm-classic-hits-181-5b84b2e3",
    "name": "181.FM - Classic Hits 181",
    "url": "http://relay.181.fm:8132",
    "genre": "Pop",
    "bitrateKbps": 128
  },
  {
    "id": "seed-2000fm-444816b7",
    "name": "2000FM",
    "url": "https://streaming.live365.com/a48930",
    "genre": "Variety",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-80splanet-8ca46272",
    "name": "80sPlanet",
    "url": "https://str3.openstream.co/560",
    "genre": "Pop,80s",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-89-3-wrkf-2735312b",
    "name": "89.3 WRKF",
    "url": "https://26423.live.streamtheworld.com/WRKFFM.mp3",
    "genre": "News, Talk",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-89-9-the-wave-halifax-ns-efbb6421",
    "name": "89.9 The Wave - Halifax, NS",
    "url": "http://mbsradio.leanstream.co/CHNSFM-MP3",
    "genre": "Classic Hits",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-90-3-amp-radio-calgary-ab-e11d4819",
    "name": "90.3 AMP Radio - Calgary, AB",
    "url": "http://live.leanstream.co/CKMPFM-MP3",
    "genre": "Top40, Pop",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-92-1-the-axe-45a25819",
    "name": "92.1 The Axe",
    "url": "https://cromwell-ice.streamguys1.com/WWGOFM",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-93-7-the-river-d9bf31c0",
    "name": "93.7 The River",
    "url": "https://desertmountainbroadcasting.streamguys1.com/KOBB-FM",
    "genre": "Oldies",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-94-1-k-sky-7874361a",
    "name": "94.1 K-SKY",
    "url": "https://desertmountainbroadcasting.streamguys1.com/KRKX",
    "genre": "Country",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-95-5-smooth-jazz-a7025770",
    "name": "95.5 Smooth Jazz",
    "url": "https://s25.ssl-stream.com:8170/radio.mp3",
    "genre": "Jazz",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-95-7-the-ranch-ac695b15",
    "name": "95.7 The Ranch",
    "url": "https://prod-44-213-133-1.amperwave.net/horizonbroadcasting-kltwfmmp3-ibc1?session-id=3b17c8ab34f150285a6f7e9121b5deb1",
    "genre": "Country",
    "language": "EN",
    "bitrateKbps": 64
  },
  {
    "id": "seed-95-9-the-wolf-c4eeb150",
    "name": "95.9 The Wolf",
    "url": "https://thassos.cdnstream.com/proxy/eastark4/stream?esPlayer&cb=213021.m4a",
    "genre": "Country",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-96-3-the-breeze-edmonton-ab-a2e11275",
    "name": "96.3 The Breeze - Edmonton, AB",
    "url": "http://live.leanstream.co/CKRAFM-MP3",
    "genre": "Soft Adult Contemporary",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-98-1-k-bear-78e0cac6",
    "name": "98.1 K-Bear",
    "url": "https://desertmountainbroadcasting.streamguys1.com/KYYA",
    "genre": "Oldies",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-98-5-virgin-radio-calgary-ab-35c45a61",
    "name": "98.5 Virgin Radio - Calgary, AB",
    "url": "http://17953.live.streamtheworld.com/CIBKFMAAC.aac",
    "genre": "Top40, Pop",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-98-9-the-river-99a454b5",
    "name": "98.9 The River",
    "url": "https://stream-01.aiir.com/vizxgvfitbpuv",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-98dabomb-classic-hip-hop-and-rnb-913b1879",
    "name": "98DaBomb -Classic Hip Hop and RNB",
    "url": "https://stream.zeno.fm/csqp40hg97nuv",
    "genre": "Hip-hop",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-99-kupi-60d641c3",
    "name": "99 KUPI",
    "url": "https://stream.zeno.fm/lxhhgpygbtltv",
    "genre": "Adult Contemporary",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-aka-radio-d7aaaba6",
    "name": "AKA Radio",
    "url": "https://streaming.live365.com/a79999",
    "genre": "News, Variety",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-artxfm-0a1c1727",
    "name": "ARTxFM",
    "url": "https://patmos.cdnstream.com/proxy/artfmin1/?mp=/stream",
    "genre": "Electronic, Hip Hop, Punk",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-aardvarkbluesfm-200ad283",
    "name": "AardvarkBluesFM",
    "url": "https://ais-sa5.cdnstream1.com/b77280_128mp3",
    "genre": "Blues",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-aggie-radio-2457d751",
    "name": "Aggie Radio",
    "url": "https://aggieradio.creek.stream/stream",
    "genre": "Variety",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-albuquerque-hott-radio-c06d0085",
    "name": "Albuquerque Hott Radio",
    "url": "https://stream.zeno.fm/5jodv6kwroquv",
    "genre": "Dance, Electronic, Hip-hop",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-all-classical-radio-21fb5427",
    "name": "All Classical Radio",
    "url": "https://allclassical.streamguys1.com/ac128kmp3",
    "genre": "Classic",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-all-star-polka-show-7d760829",
    "name": "All Star Polka Show",
    "url": "https://dc2.serverse.com:8052/stream",
    "genre": "Polka",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-allfunkradio-c5818e3a",
    "name": "AllFunkRadio",
    "url": "https://stream.laut.fm/54-funk-soul-dance",
    "genre": "Funk,soul,jazz",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-allundergroundhiphopradio-b85feb03",
    "name": "AllUndergroundHipHopRadio",
    "url": "https://stream.radiojar.com/c1912tk5rtzuv",
    "genre": "Hiphop",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-america-s-greatest-80s-hits-2197ecdf",
    "name": "America's Greatest 80s Hits",
    "url": "https://ais-sa2.cdnstream1.com/2281_128.mp3",
    "genre": "80s",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-angel-fire-radio-489205f9",
    "name": "Angel Fire Radio",
    "url": "https://streaming.live365.com/a63504",
    "genre": "00s",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-arizona-hott-radio-e6757bdc",
    "name": "Arizona Hott Radio",
    "url": "https://stream.zeno.fm/bcf9y3d77a0uv",
    "genre": "Rap",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-arkansas-rocks-fm-06d7727a",
    "name": "Arkansas Rocks FM",
    "url": "https://streamdb6web.securenetsystems.net/cirruscontent/KLRG&",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-aspen-public-radio-e8fc476a",
    "name": "Aspen Public Radio",
    "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/KAJXFM.mp3",
    "genre": "News, Talk, Pop",
    "language": "EN",
    "bitrateKbps": 32
  },
  {
    "id": "seed-b92-1-3ce0ac52",
    "name": "B92.1",
    "url": "https://live.amperwave.net/direct/townsquare-kxbnfmmp3-ibc3",
    "genre": "Hits",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-b98-aedb6975",
    "name": "B98",
    "url": "https://das-edge12-live365-dal02.cdnstream.com/a29918",
    "genre": "Adult Contemporary",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-beatles-radio-4f526fae",
    "name": "Beatles Radio",
    "url": "https://strw3.openstream.co/981",
    "genre": "Indie Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-big-hits-100-fcb7ffb6",
    "name": "Big Hits 100",
    "url": "https://streaming.live365.com/a82250",
    "genre": "Variety",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-big-r-radio-6f5bec22",
    "name": "Big R Radio",
    "url": "https://bigrradio.cdnstream1.com/5182_128?listenerid=ea4ef9d7-dc2d-496b-9f18-5bbd5ca7923a&cb=974096.mp3",
    "genre": "Variety",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-bigrig-fm-586903b9",
    "name": "BigRig FM",
    "url": "https://radio.bigrig.fm/",
    "genre": "Country",
    "language": "EN",
    "bitrateKbps": 320
  },
  {
    "id": "seed-branson-christmas-radio-5c1fcd1a",
    "name": "Branson Christmas Radio",
    "url": "https://n0c.radiojar.com/22habbgmb?rj-ttl=5&rj-tok=AAABnsxBnWAAN8AXmLSLOdrLxQ",
    "genre": "Christmas",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-c95-95-1-saskatoon-sk-9e05a1f3",
    "name": "C95 95.1 - Saskatoon, SK",
    "url": "http://rawlco.leanstream.co/CFMCFM?args=tunein_02",
    "genre": "Pop, Top40",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-caya-radio-635c9a4a",
    "name": "CAYA Radio",
    "url": "https://tuneintoradio1.com/listen/caya_radio/radio.mp3",
    "genre": "Indie, Alternative",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-cfcw-840-camrose-ab-996e49de",
    "name": "CFCW 840 - Camrose, AB",
    "url": "http://newcap.leanstream.co/CFCWAM-MP3?args=tunein_01",
    "genre": "Country",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-cfox-99-3-vancouver-bc-af926100",
    "name": "CFOX 99.3 - Vancouver, BC",
    "url": "http://live.leanstream.co/CFOXFM-MP3",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-cfrc-101-9-kingston-on-3e15d38f",
    "name": "CFRC 101.9 - Kingston, ON",
    "url": "http://stream.cfrc.ca:8000/;",
    "genre": "College, Variety",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-cfwe-98-5-edmonton-ab-95d4d5c0",
    "name": "CFWE 98.5 - Edmonton, AB",
    "url": "http://entry-amms-1.leanstream-hd.com:2112/CFWEFM-MP3",
    "genre": "Country, Indigenous",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-choi-fm-radiox-98-1-quebec-canada-be8f90ad",
    "name": "CHOI fm RadioX 98.1 (Quebec, Canada)",
    "url": "http://stream.radiox.com/choi.mp3",
    "genre": "CHOI fm RadioX 98.1 (Quebec, Canada)",
    "bitrateKbps": 128
  },
  {
    "id": "seed-chum-104-5-toronto-on-2bd67c56",
    "name": "CHUM 104.5 - Toronto, ON",
    "url": "http://5843.live.streamtheworld.com/CHUMFMAAC_SC",
    "genre": "Top40, Pop",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-cisn-country-103-9-edmonton-ab-92127cc3",
    "name": "CISN Country 103.9 - Edmonton, AB",
    "url": "http://live.leanstream.co/CISNFM-MP3",
    "genre": "Country",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-cjay-92-calgary-ab-29df0f6c",
    "name": "CJAY 92 - Calgary, AB",
    "url": "http://playerservices.streamtheworld.com/api/livestream?station=CJAYFM",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-cjvr-105-1-melfort-sk-aff66e36",
    "name": "CJVR 105.1 - Melfort, SK",
    "url": "http://CJVR.streamon.fm:8000/CJVR-64k-m.mp3",
    "genre": "Country",
    "language": "EN",
    "bitrateKbps": 64
  },
  {
    "id": "seed-ckua-94-9-edmonton-ab-2ead4e0a",
    "name": "CKUA 94.9 - Edmonton, AB",
    "url": "http://ckua.streamon.fm:8000/CKUA-64k-m.mp3",
    "genre": "Public Radio, Music",
    "language": "EN",
    "bitrateKbps": 64
  },
  {
    "id": "seed-candid-radio-wy-4b07928c",
    "name": "Candid Radio WY",
    "url": "https://stream.zeno.fm/5dune0us008uv",
    "genre": "Variety",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-channel-x94-f41adad5",
    "name": "Channel X94",
    "url": "https://s5.radio.co/sea8361925/listen",
    "genre": "Top40",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-chaos-radio-fa1bc39a",
    "name": "Chaos Radio!",
    "url": "https://stream.streamaudio.de:8000/teststream2",
    "genre": "Punk",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-classic-guitar-radio-1930ebb5",
    "name": "Classic Guitar Radio",
    "url": "http://108.86.185.142:8020/radio.mp3",
    "genre": "Classic",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-classic-hits-97-7-0d87feff",
    "name": "Classic Hits 97.7",
    "url": "https://streaming.live365.com/a85933",
    "genre": "Oldies",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-classic-hits-cool-102-7-43d61342",
    "name": "Classic Hits Cool 102.7",
    "url": "https://stream.radiojar.com/q68rwgwwpv8uv",
    "genre": "Oldies",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-classic-oasis-6332187d",
    "name": "Classic Oasis",
    "url": "https://usa6.fastcast4u.com/proxy/tholdahl2?mp=/1",
    "genre": "Classic",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-classic-rock-101-vancouver-bc-4d689392",
    "name": "Classic Rock 101 - Vancouver, BC",
    "url": "http://live.leanstream.co/CFMIFM-MP3?",
    "genre": "Classic Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-classichits96-9-62863932",
    "name": "ClassicHits96.9",
    "url": "https://s5.radio.co/s6ac20f7f4/listen",
    "genre": "80s,70s,hits",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-colorado-public-radio-news-2ddddacb",
    "name": "Colorado Public Radio News",
    "url": "https://stream1.cprnetwork.org/cpr1_lo",
    "genre": "News, Talk",
    "language": "EN",
    "bitrateKbps": 64
  },
  {
    "id": "seed-country-105-1-calgary-ab-5338338b",
    "name": "Country 105.1 - Calgary, AB",
    "url": "http://live.leanstream.co/CKRYFM?",
    "genre": "Country",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-defjay-radio-a632e8ce",
    "name": "DEFJAY Radio",
    "url": "http://tuner.defjay.com:80/;?.mp3",
    "genre": "RNB/Urban/Hip Hop/Rap",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-deep-oldies-200c8a1d",
    "name": "Deep Oldies",
    "url": "https://s6.reliastream.com/proxy/radiofr1?mp=/stream",
    "genre": "Oldies",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-digital-95-fm-0040a2ac",
    "name": "Digital 95 FM",
    "url": "https://usa14.fastcast4u.com/proxy/cachanilla?mp=/1",
    "genre": "Pop, Top 40",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-edm-sessions-08086224",
    "name": "EDM Sessions",
    "url": "https://s2.radio.co/s30844a0f4/listen",
    "genre": "Dance, Electronic, House",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-eight-room-radio-d769f306",
    "name": "Eight Room Radio",
    "url": "https://s5.radio.co/sb885ffa7f/listen",
    "genre": "Variety",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-fox-sports-radio-91d2d6c5",
    "name": "Fox Sports Radio",
    "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/KKGKAM_SC?dist=onlineradiobox",
    "genre": "News, Talk, Sports",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-freedom-92-9-526736af",
    "name": "Freedom 92.9",
    "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/WSEIFM.mp3?dist=onlineradiobox",
    "genre": "Country, News",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-fromrock106-9-9a7b0801",
    "name": "FromRock106.9",
    "url": "http://zrockkkzr.com:9000/ZRock128k.mp3/",
    "genre": "Heavymetal,Hardrock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-goodcompany89-5-7e9eb2f2",
    "name": "GoodCompany89.5",
    "url": "https://www.streamcontrol.net:8444/s/12340",
    "genre": "Easylistening",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-hppr-9a17ee9f",
    "name": "HPPR",
    "url": "https://14843.live.streamtheworld.com/KANZFM_HPPR.mp3",
    "genre": "Blues, Jazz, Folk",
    "language": "EN",
    "bitrateKbps": 64
  },
  {
    "id": "seed-hard-rock-heaven-0b6fdd6d",
    "name": "Hard Rock Heaven",
    "url": "http://hydra.cdnstream.com/1521_128",
    "genre": "Heavy Metal, Hard Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-hardradio-d6ffe4ad",
    "name": "HardRadio",
    "url": "http://144.217.29.205/;stream.nsv",
    "genre": "Hardrock, metal",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-heart-soul-ba862ce5",
    "name": "Heart & Soul",
    "url": "https://crystalout.surfernetwork.com:8001/KRMP_MP3",
    "genre": "Soul",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-hits101-radio-1234cae1",
    "name": "Hits101 Radio",
    "url": "https://sky.doscast.com/proxy/hits101radio/stream",
    "genre": "Variety",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-hot-101-3-bonnyville-ab-b3816f7c",
    "name": "Hot 101.3 - Bonnyville, AB",
    "url": "http://newcap.leanstream.co/CJEGFM",
    "genre": "Adult Contemporary",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-hot-97-7-the-flashback-channel-bf65ad7b",
    "name": "Hot 97.7 (The Flashback Channel)",
    "url": "https://cast3.torontocast.com:1415/stream",
    "genre": "80s, 90s, 00s",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-i-rock-105-1-de6c9ee9",
    "name": "I-Rock 105.1",
    "url": "https://streamdb8web.securenetsystems.net/v5/KYUNHD2",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-ipr-classic-4350618a",
    "name": "IPR Classic",
    "url": "https://classical-stream.iowapublicradio.org/Classical.mp3",
    "genre": "Classic",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-ipr-news-dcd0aaf0",
    "name": "IPR News",
    "url": "https://news-stream.iowapublicradio.org/News.mp3",
    "genre": "News, Talk",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-ipr-studio-one-bbb5a1f8",
    "name": "IPR Studio One",
    "url": "https://studioone-stream.iowapublicradio.org/StudioOne.mp3",
    "genre": "Indie, Alternative",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-indie88-88-1-toronto-on-3cf91a17",
    "name": "Indie88 88.1 - Toronto, ON",
    "url": "http://cob-ais.leanstream.co//CINDFM?args=web_01",
    "genre": "Indie, Alternative",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-j-99-jams-bff222ea",
    "name": "J 99 Jams",
    "url": "https://usa14.fastcast4u.com/proxy/urbanmed?mp=/1/;",
    "genre": "Hip-hop, Funk, RnB",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-jackson-hole-community-radio-30d290d5",
    "name": "Jackson Hole Community Radio",
    "url": "http://peridot.streamguys.com:6010/live",
    "genre": "News, Indie",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-jazz-88-3-kcck-e84b2be1",
    "name": "Jazz 88.3 KCCK",
    "url": "https://stream.kcck.org/jazz883kcck",
    "genre": "Jazz, Classic",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-jazz-oasis-e5eed85b",
    "name": "Jazz Oasis",
    "url": "http://108.86.185.142:8000/radio.mp3",
    "genre": "Jazz, Oldies",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-k-pop-highway-radio-227e555c",
    "name": "K-Pop Highway Radio",
    "url": "https://listen.radioking.com/radio/677089/stream/741367",
    "genre": "K-Pop",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-k100-100-5-saint-john-nb-ffa87c1b",
    "name": "K100 100.5 - Saint John, NB",
    "url": "http://mbsradio.leanstream.co/CIOKFM-MP3",
    "genre": "Adult Contemporary",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-k4co-radio-6ec44e57",
    "name": "K4CO Radio",
    "url": "https://stream.radio.co/s496aa7b73/listen",
    "genre": "Rock, Blues, Jazz",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-k97-97-3-edmonton-ab-1f052c16",
    "name": "K97 97.3 - Edmonton, AB",
    "url": "http://newcap.leanstream.co/CIRKFM",
    "genre": "Classic Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-kbrd-680-am-979cd581",
    "name": "KBRD 680 AM",
    "url": "http://205.134.192.90:680/;",
    "genre": "Oldies",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-kbut-d7fcb243",
    "name": "KBUT",
    "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/KBUTFM.mp3?dist=onlineradiobox",
    "genre": "News, Talk, Entertainment",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-kcrw-b020fdbe",
    "name": "KCRW",
    "url": "https://streams.kcrw.com/kcrw_mp3",
    "genre": "Pop, News",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-kdoe-radio-8364ed5e",
    "name": "KDOE Radio",
    "url": "https://sr1.tkdsradio.com/listen/kdoe1023/radio.mp3",
    "genre": "Adult Contemporary",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-kexp-1c6cba99",
    "name": "KEXP",
    "url": "https://kexp-mp3-128.streamguys1.com/kexp128.mp3",
    "genre": "Indie, Alternative Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-kflo-102-9-fm-2d594c8e",
    "name": "KFLO 102.9 FM",
    "url": "http://216.163.19.29:8080/stream.mp3",
    "genre": "Hits, Oldies",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-kglt-fm-alternative-public-radio-a88414ee",
    "name": "KGLT-FM Alternative Public Radio",
    "url": "https://live.kgltradio.com/256",
    "genre": "Rock, Pop, Talk, Indie",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-khdx-radio-1aefa838",
    "name": "KHDX Radio",
    "url": "https://streaming.radio.co/s662abb673/listen",
    "genre": "Indie, Alternative",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-kios-omaha-public-radio-5bf663bd",
    "name": "KIOS - Omaha Public Radio",
    "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/KIOSFM.mp3?dist=onlineradiobox",
    "genre": "News, Jazz",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-klsu-e5cb240f",
    "name": "KLSU",
    "url": "https://listen.lsureveille.com/stream",
    "genre": "Top40",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-kma-960-am-79b51d68",
    "name": "KMA 960 AM",
    "url": "https://ice5.securenetsystems.net/KMAAM?playSessionID=34775B90-B922-4657-99FB7D147F658CB2",
    "genre": "News, Talk, Sport",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-kmet-radio-0e7de805",
    "name": "KMet Radio",
    "url": "https://streams.radio.co/sc35284aed/listen",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-komp-92-3-aa8ff8e5",
    "name": "KOMP 92.3",
    "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/KOMPFM_SC?dist=onlineradiobox",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-kprs-hot-103-jamz-d552904e",
    "name": "KPRS - HOT 103 JAMZ!",
    "url": "http://s5.voscast.com:7194/;",
    "genre": "News, Country, Sport",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-krnu-0030ec04",
    "name": "KRNU",
    "url": "https://s8.yesstreaming.net:17004/krnu",
    "genre": "Indie Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-krws-fm-9bfb943f",
    "name": "KRWS-FM",
    "url": "http://65.100.74.57:7001/krwsfm",
    "genre": "Rock, Oldies",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-kscb-fm-b107-5-c591c252",
    "name": "KSCB FM - B107.5",
    "url": "https://streaming.live365.com/a47006",
    "genre": "Rock, Pop, R&B",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-ksrjslowjamsradio-c781ec9d",
    "name": "KSRJSlowJamsRadio",
    "url": "https://stream.radiojar.com/ypargqan2qzuv",
    "genre": "R&B,soul",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-kuoi-fm-081ffcfe",
    "name": "KUOI-FM",
    "url": "https://s2.radio.co/sedf30688d/listen",
    "genre": "Rock, Alternative",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-kyk-95-7-alma-qc-9c558d41",
    "name": "KYK 95.7 - Alma, QC",
    "url": "http://icecast-ckyk.rncm.ca/ckyk.mp3",
    "genre": "Rock",
    "language": "FR",
    "bitrateKbps": 128
  },
  {
    "id": "seed-kzel-96-1-330a060c",
    "name": "KZEL 96.1",
    "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/KZELFM.mp3",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 80
  },
  {
    "id": "seed-kzum-89-3-fm-2fe6d02f",
    "name": "KZUM 89.3 FM",
    "url": "http://us4.internet-radio.com:8030/stream",
    "genre": "Variety",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-kepadre-radio-0b28d55f",
    "name": "KePadre Radio",
    "url": "https://vsstreaming.com/8012/stream",
    "genre": "Latin Jazz",
    "language": "ES",
    "bitrateKbps": 128
  },
  {
    "id": "seed-magic-104-1-94863144",
    "name": "Magic 104.1",
    "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/KMGLFM.mp3?dist=onlineradiobox",
    "genre": "Adult Contemporary",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-metal-underground-radio-612f991e",
    "name": "Metal Underground Radio",
    "url": "https://streaming.live365.com/a93362",
    "genre": "Heavy Metal, Hard Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-mix-107-5-38242379",
    "name": "Mix 107.5",
    "url": "https://streaming.live365.com/a90519",
    "genre": "Adult Contemporary, News",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-moab-rocks-radio-5d029322",
    "name": "Moab Rocks Radio",
    "url": "https://streaming.live365.com/a24346",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-mountain-fm-106-5-canmore-ab-75aa8f4a",
    "name": "Mountain FM 106.5 - Canmore, AB",
    "url": "http://can1065.akacast.akamaistream.net/7/314/80902/v1/rogers.akacast.akamaistream.net/can1065",
    "genre": "Adult Contemporary",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-music-city-roadhouse-467181d6",
    "name": "Music City Roadhouse",
    "url": "https://das-edge62-live365-dal03.cdnstream.com/a73754",
    "genre": "Rock, Blues",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-nw-radio-1-edc494b0",
    "name": "NW Radio 1",
    "url": "https://listen.radioking.com/radio/668452/stream/732466",
    "genre": "News, Hits",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-native-radio-contemporary-music-e2954cfe",
    "name": "Native Radio - Contemporary Music",
    "url": "https://cast1.asurahosting.com/proxy/nativera/stream",
    "genre": "Country, Folk",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-native-voice-one-kwrr-89-5-fm-3219f96f",
    "name": "Native Voice One - KWRR 89.5 FM",
    "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/NV1.mp3?dist=onlineradiobox",
    "genre": "News, talk",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-new-country-95-5-red-deer-ab-0cec5af3",
    "name": "New Country 95.5 - Red Deer, AB",
    "url": "http://newcap.leanstream.co/CKGYFM",
    "genre": "Country",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-new-country-95-9-lloydminster-ab-5e9eb440",
    "name": "New Country 95.9 - Lloydminster, AB",
    "url": "http://newcap.leanstream.co/CKSAFM-MP3?args=tunein_01",
    "genre": "Country",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-new-country-97-7-st-paul-ab-692d4eb9",
    "name": "New Country 97.7 - St. Paul, AB",
    "url": "http://newcap.leanstream.co/CHSPFM",
    "genre": "Country",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-new-country-98-1-camrose-ab-033a1f53",
    "name": "New Country 98.1 - Camrose, AB",
    "url": "http://newcap.leanstream.co/CFCWFM-MP3?args=tunein_01",
    "genre": "Country",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-new-country-98-9-144e2dd9",
    "name": "New Country 98.9",
    "url": "https://26303.live.streamtheworld.com/WSIPFM.mp3",
    "genre": "Country, Top40",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-news-talk-770-calgary-ab-6628d09e",
    "name": "News Talk 770 - Calgary, AB",
    "url": "https://live.leanstream.co/CHQRAM-MP3",
    "genre": "News, Talk",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-news88-7fm-c06d2e06",
    "name": "News88.7FM",
    "url": "https://stream.houstonpublicmedia.org/news-mp3",
    "genre": "News",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-ozfm-94-7-st-johns-nl-b69a7af4",
    "name": "OZFM 94.7 - St. Johns, NL",
    "url": "http://174.37.159.206:8262/;stream/1.mp3",
    "genre": "Rock, Pop",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-oklahoma-hott-radio-d3e50ae7",
    "name": "Oklahoma Hott Radio",
    "url": "https://stream-156.zeno.fm/86gat9c8dd0uv?zs=6Wflx2BcTGeW7VJnCczt1g",
    "genre": "Rap",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-outer-rim-6f84fffe",
    "name": "Outer Rim",
    "url": "https://andylibretime.radioca.st/stream",
    "genre": "Variety",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-planet-106-7-a9987b49",
    "name": "Planet 106.7",
    "url": "https://desertmountainbroadcasting.streamguys1.com/KPLN",
    "genre": "Adult contemporary, Pop",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-prog-rock-and-metal-radio-1593d32b",
    "name": "Prog Rock and Metal Radio",
    "url": "http://149.56.234.138:8025/stream",
    "genre": "Rock, Metal",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-public-radio-67754507",
    "name": "Public Radio",
    "url": "https://utulsa.streamguys1.com/KWGSHD1-MP3",
    "genre": "Talk",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-q107-toronto-on-d814dc95",
    "name": "Q107 - Toronto, ON",
    "url": "http://live.leanstream.co/CILQFM-MP3",
    "genre": "Classic Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-q107-3-calgary-ab-577067c4",
    "name": "Q107.3 - Calgary, AB",
    "url": "http://live.leanstream.co/CFGQFM-MP3?",
    "genre": "Classic Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-q93-cb296b8a",
    "name": "Q93",
    "url": "https://ice5.securenetsystems.net/KQID?playSessionID=B251D7EF-023D-F842-137699D6C8C447EC",
    "genre": "Pop, Top40",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-radio-3hive-250f622c",
    "name": "Radio 3hive",
    "url": "https://streamer.radio.co/s68e7b4d75/listen",
    "genre": "Eclectic",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-radio-719-12a655b4",
    "name": "Radio 719",
    "url": "https://streaming.live365.com/a60937",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-radio-biptunia-747b2ffc",
    "name": "Radio BipTunia",
    "url": "https://ecast.myautodj.com:1380/listen.mp3",
    "genre": "Electronic",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-radio-la-bronca-62a67b9c",
    "name": "Radio La Bronca",
    "url": "http://s7.voscast.com:8568/;",
    "genre": "Spanish",
    "language": "ES",
    "bitrateKbps": 128
  },
  {
    "id": "seed-radio-npr-89-1-fm-0c18d0a5",
    "name": "Radio NPR 89.1 FM",
    "url": "https://npr-ice.streamguys1.com/live.mp3",
    "genre": "News, Talk",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-radiodismuke-85de5ed7",
    "name": "RadioDismuke",
    "url": "http://stream1.radiodismuke.com:8078/;stream.mp3",
    "genre": "1920/30Jazz",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-radioprogrock-c66ffe52",
    "name": "RadioprogRock",
    "url": "https://pavo.prostreaming.net:8012/stream",
    "genre": "Progressiverock,Progressivemetal",
    "language": "ES",
    "bitrateKbps": 128
  },
  {
    "id": "seed-radiostorm-com-3db04282",
    "name": "Radiostorm.com",
    "url": "https://ais-sa5.cdnstream1.com/b30572_128mp3",
    "genre": "Adult Contemporary",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-retro-country-890-ef67c38d",
    "name": "Retro Country 890",
    "url": "https://tuneintoradio1.com/radio/8050/radio.mp3",
    "genre": "Country, Retro",
    "language": "EN",
    "bitrateKbps": 64
  },
  {
    "id": "seed-retromediaallstars-3a74a960",
    "name": "RetroMediaAllstars",
    "url": "https://das-edge62-live365-dal03.cdnstream.com/a31383",
    "genre": "Oldies",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-silky-jamz-3284c9f9",
    "name": "Silky Jamz",
    "url": "http://216.245.218.194:8123/stream",
    "genre": "R&B",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-simliveradio-1fc0b7e1",
    "name": "SimLiveRadio",
    "url": "http://stream.laut.fm/simliveradio",
    "genre": "Sim radio",
    "language": "DE",
    "bitrateKbps": 128
  },
  {
    "id": "seed-simulator-radio-06257e48",
    "name": "Simulator Radio",
    "url": "http://stream.simulatorradio.com:8002/stream.mp3",
    "genre": "Sim radio",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-sincity-hott-radio-7192a61e",
    "name": "SinCity Hott Radio",
    "url": "https://stream.zeno.fm/h9xhu77pva0uv",
    "genre": "Hip-hop, RnB",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-smooth-jazz-105-9-e66a06f3",
    "name": "Smooth Jazz 105.9",
    "url": "https://s25.ssl-stream.com:8180/radio.mp3",
    "genre": "Acid Jazz, R&B",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-smooth-jazz-nola-df134ba6",
    "name": "Smooth Jazz Nola",
    "url": "https://listen.radioking.com/radio/517897/stream/575959",
    "genre": "Smooth Jazz",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-smoothurbanjazzcafe-c362bba1",
    "name": "SmoothUrbanJazzCafe",
    "url": "https://listen.radioking.com/radio/326191/stream/374248",
    "genre": "R&B,soul",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-souldies-radio-a1aea070",
    "name": "Souldies Radio",
    "url": "https://streaming.live365.com/a80809",
    "genre": "Oldies",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-st-louis-public-radio-50f6f635",
    "name": "St. Louis Public Radio",
    "url": "https://kwmu1-ice.streamguys1.com/kwmu1?uuid=t6z0ikcdt",
    "genre": "News, Talk",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-star-radio-2bd3a7bb",
    "name": "Star Radio",
    "url": "http://ks.mycp.stream:11318/stream",
    "genre": "Adult contemporary",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-star-radio-wyoming-8d8db1ec",
    "name": "Star Radio Wyoming",
    "url": "https://stream.zeno.fm/zev9pxkffk8vv",
    "genre": "Variety",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-stereo-salvaje-d1036e46",
    "name": "Stereo Salvaje",
    "url": "http://stereosalvaje.primcast.com:4326/;",
    "genre": "Mexican",
    "language": "ES",
    "bitrateKbps": 128
  },
  {
    "id": "seed-street-style-radio-6e056607",
    "name": "Street Style Radio",
    "url": "https://das-edge12-live365-dal02.cdnstream.com/a95865",
    "genre": "Dance, R&B, Hip-Hop",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-techliveradio-448fb672",
    "name": "TechLiveRadio",
    "url": "http://stream.laut.fm/techliveradio",
    "genre": "Pop",
    "language": "DE",
    "bitrateKbps": 128
  },
  {
    "id": "seed-that-70-xe2-x80-x98s-channel-840f7b21",
    "name": "That 70\\xe2\\x80\\x98s Channel",
    "url": "https://ais-sa5.cdnstream1.com/b68000_128mp3",
    "genre": "Disco, 70s",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-that-90s-channel-13ab8709",
    "name": "That 90s Channel",
    "url": "https://ais-sa3.cdnstream1.com/4492_192.mp3",
    "genre": "90s",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-the-blaze-2d2bea76",
    "name": "The Blaze",
    "url": "https://stream.zeno.fm/c1z4vwrrilhvv",
    "genre": "Pop, Rock, Metal",
    "language": "EN",
    "bitrateKbps": 64
  },
  {
    "id": "seed-the-edge-d2d0f9af",
    "name": "The Edge",
    "url": "https://streaming.live365.com/a99781",
    "genre": "Indie, Grunge, Punk",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-the-new-94-rock-35bed2f9",
    "name": "The NEW 94 Rock",
    "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/KNENFM.mp3?dist=onlineradiobox",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-the-original-free-fm-106-5-100-7-fm-dc844abe",
    "name": "The Original Free FM 106.5 & 100.7 FM",
    "url": "http://centova87.instainternet.com:8725/stream",
    "genre": "Oldies",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-the-shooey-von-gooey-spectacular-4ef0744e",
    "name": "The Shooey Von Gooey Spectacular",
    "url": "https://listen.radioking.com/radio/882401/stream/952646",
    "genre": "Classic Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-the-zone-96-3-649ef7a5",
    "name": "The Zone 96.3",
    "url": "https://desertmountainbroadcasting.streamguys1.com/KRZN",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-throwback-80s-8ac4d218",
    "name": "Throwback 80s",
    "url": "https://streaming.live365.com/a64425",
    "genre": "80s, Metal",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-thunder-105-5-ktrz-5dae63f3",
    "name": "Thunder 105.5 KTRZ",
    "url": "Thunder 105.5 KTRZ",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-trucksimfm-1fb37f5a",
    "name": "TruckSimFM",
    "url": "http://radio.trucksim.fm:8000/stream",
    "genre": "Sim radio",
    "language": "EN",
    "bitrateKbps": 320
  },
  {
    "id": "seed-truckstopradio-ccd6587c",
    "name": "TruckStopRadio",
    "url": "https://oreo.truckstopradio.co.uk/radio/8000/radio.mp3",
    "genre": "Sim Radio",
    "language": "EN",
    "bitrateKbps": 320
  },
  {
    "id": "seed-truckersfm-5b595994",
    "name": "TruckersFM",
    "url": "https://radio.truckers.fm/",
    "genre": "Sim radio",
    "language": "EN",
    "bitrateKbps": 320
  },
  {
    "id": "seed-v103-0bba2cb5",
    "name": "V103",
    "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/KOMAHD3.mp3?dist=onlineradiobox",
    "genre": "Hip-hop",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-vip-radio-colorado-684f02a5",
    "name": "VIP Radio Colorado",
    "url": "https://stream.zeno.fm/zrgzs0bqkkhvv",
    "genre": "Variety",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-vip-radio-wyoming-e7242855",
    "name": "VIP Radio Wyoming",
    "url": "https://stream.zeno.fm/y2w92tms2nhvv",
    "genre": "Variety",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-vibe-of-vegas-40cab27b",
    "name": "Vibe of Vegas",
    "url": "http://relay.181.fm:8074/",
    "genre": "Dance, Electronic",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-virtualdjradio-clubzone-873cf2d2",
    "name": "VirtualDJRadio-ClubZone",
    "url": "http://virtualdjradio.com:8000/channel1.mp3/",
    "genre": "Dance,electronic,house",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-wcpt-820-chicago-s-progressive-talk-ba74653f",
    "name": "WCPT 820 Chicago's Progressive Talk",
    "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/WCPTAM_SC?dist=onlineradiobox",
    "genre": "News, Talk",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-wmky-fcfefb66",
    "name": "WMKY",
    "url": "https://18423.live.streamtheworld.com/WMKYFM.mp3",
    "genre": "Blues, Jazz, Americana",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-wmot-roots-radio-45c5f7da",
    "name": "WMOT Roots Radio",
    "url": "https://18323.live.streamtheworld.com/WMOTFM.mp3",
    "genre": "American",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-wtix-fm-9e8fe18f",
    "name": "WTIX-FM",
    "url": "http://hemnos.cdnstream.com/1427_64?cb=367841.mp3",
    "genre": "Rock, R&B, Oldies",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-wwoz-90-7-fm-d7718da6",
    "name": "WWOZ 90.7 FM",
    "url": "https://wwoz-sc.streamguys1.com/wwoz-hi.mp3",
    "genre": "Blues, Jazz",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-wyml-lp-99-9-fm-97f2dddb",
    "name": "WYML-LP 99.9 FM",
    "url": "https://seahorse.juststreamwith.us:8000/stream",
    "genre": "Rock, Indie, Metal",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-x-rock-radio-e8ac16d4",
    "name": "X Rock Radio",
    "url": "http://162.244.80.31:4442/;stream.mp3",
    "genre": "Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-xl-103-1-calgary-ab-9254299c",
    "name": "XL 103.1 - Calgary, AB",
    "url": "http://newcap.leanstream.co/CFXLFM",
    "genre": "Classic Hits, Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-xray-fm-0420ab91",
    "name": "XRAY.fm",
    "url": "https://listen.xray.fm/stream",
    "genre": "Variety",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-z92-3-4aad222b",
    "name": "Z92.3",
    "url": "https://playerservices.streamtheworld.com/api/livestream-redirect/WZPWFM.mp3?dist=onlineradiobox",
    "genre": "Top40",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-ambient-fm-d2024ba8",
    "name": "ambient.fm",
    "url": "https://phoebe.streamerr.co:4140/ambient.mp3",
    "genre": "Ambient",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-boom-101-1-brooks-ab-9aee356f",
    "name": "boom 101.1 - Brooks, AB",
    "url": "http://newcap.leanstream.co/CIXFFM",
    "genre": "Classic Hits",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-boom-101-9-wainwright-ab-cacfb157",
    "name": "boom 101.9 - Wainwright, AB",
    "url": "http://newcap.leanstream.co/CKKYFM",
    "genre": "Classic Hits",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-boom-103-5-lac-la-biche-ab-645162f7",
    "name": "boom 103.5 - Lac La Biche, AB",
    "url": "http://newcap.leanstream.co/CILBFM",
    "genre": "Classic Hits",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-boom-92-7-slave-lake-ab-afadfb95",
    "name": "boom 92.7 - Slave Lake, AB",
    "url": "http://newcap.leanstream.co/CHSLFM",
    "genre": "Classic Hits",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-boom-94-1-athabasca-ab-00a6e8b6",
    "name": "boom 94.1 - Athabasca, AB",
    "url": "http://newcap.leanstream.co/CKBAFM",
    "genre": "Classic Hits",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-boom-95-3-cold-lake-ab-717a9733",
    "name": "boom 95.3 - Cold Lake, AB",
    "url": "http://newcap.leanstream.co/CJXKFM-MP3?args=3rdparty_02",
    "genre": "Classic Hits",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-boom-96-7-whitecourt-ab-d89322d6",
    "name": "boom 96.7 - Whitecourt, AB",
    "url": "http://newcap.leanstream.co/CFXWFM-MP3",
    "genre": "Classic Hits",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-boom-97-3-toronto-on-b074a750",
    "name": "boom 97.3 - Toronto, ON",
    "url": "http://newcap.leanstream.co/CHBMFM-MP3",
    "genre": "Classic Hits",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-boom-99-7-ottawa-on-dbecfaa8",
    "name": "boom 99.7 - Ottawa, ON",
    "url": "http://live.leanstream.co/CJOTFM-MP3",
    "genre": "Classic Hits",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-humalt-com-e95247df",
    "name": "humalt.com",
    "url": "https://listen.radioking.com/radio/397882/stream/449875",
    "genre": "Alternative Rock",
    "language": "EN",
    "bitrateKbps": 128
  },
  {
    "id": "seed-simulatorone-4b180078",
    "name": "simulatorONE",
    "url": "http://stream.laut.fm/simulator1",
    "genre": "Sim radio",
    "language": "DE",
    "bitrateKbps": 128
  }
];
