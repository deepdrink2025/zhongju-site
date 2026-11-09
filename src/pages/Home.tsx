import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import StatsBar from '../components/StatsBar';
import About from '../components/About';
import Solutions from '../components/Solutions';
import Timeline from '../components/Timeline';
import Honors from '../components/Honors';
import Clients from '../components/Clients';
import Contact from '../components/Contact';
import Footer from '../components/Footer';
import BackToTop from '../components/BackToTop';
import TabBar from '../components/TabBar';

/**
 * 官网首页：单页锚点滚动布局（移动端底部 TabBar）
 * 注：云名片生成页（/create）为内部工具，不在官网展示任何入口，
 * 业务人员通过私密链接 + 口令访问。
 */
export default function Home() {
  return (
    <div className="min-h-screen pb-14 lg:pb-0">
      <Navbar />
      <main>
        <Hero />
        <StatsBar />
        <About />
        <Solutions />
        <Timeline />
        <Honors />
        <Clients />
        <Contact />
      </main>
      <Footer />
      <BackToTop />
      <TabBar />
    </div>
  );
}
