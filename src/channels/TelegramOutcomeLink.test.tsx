import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {TelegramShell} from './TelegramShell';
const enter=vi.hoisted(()=>vi.fn(async()=>({loginId:'customer',token:'token'})));
vi.mock('./channelAuthentication',()=>({enterChannel:enter,linkChannel:vi.fn()}));
vi.mock('../api',()=>({APP_API:'/nodics/circa.ewaste/v0',request:vi.fn(async()=>({presentation:{sampleMode:true}})),saveSession:vi.fn(),setTelegramLaunch:vi.fn()}));
vi.mock('./journeyHost',()=>({telegramJourneyHost:()=>({kind:'telegram'})}));
vi.mock('../mobile/MobileLaunchScreen',()=>({MobileLaunchScreen:()=>null}));
vi.mock('../mobile/MobileApp',()=>({MobileApp:({initialSubmissionCode}:{initialSubmissionCode:string})=><p>Notification item: {initialSubmissionCode}</p>}));
afterEach(()=>{cleanup();delete window.Telegram;});
it('passes the launch target to the shared mobile shell after channel authentication',async()=>{
 const initData='start_param=WST_APPROVED&auth_date=1&hash=signed-fixture';
 window.Telegram={WebApp:{initData,ready:vi.fn(),expand:vi.fn()}};
 render(<TelegramShell/>);
 expect(await screen.findByText('Notification item: WST_APPROVED')).toBeInTheDocument();
 expect(enter).toHaveBeenCalledWith('TELEGRAM',initData);
});
