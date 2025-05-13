import { Label } from '@/components/ui/label';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
} from '@/components/ui/sidebar';

function Inbox() {
  return (
    <div>
      <Sidebar collapsible="none">
        <SidebarHeader>
          <Label>Inbox</Label>
          <SidebarInput placeholder="Type to search inbox..." />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="flex">
            <SidebarGroupLabel>Messages</SidebarGroupLabel>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </div>
  );
}

export default Inbox;
