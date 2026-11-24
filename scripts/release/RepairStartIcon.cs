// Built into the installer. Shell extensions run in this short-lived STA process.
using System;
using System.IO;
using System.Runtime.InteropServices;

internal static class RepairStartIcon
{
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern void SHChangeNotify(int change, uint flags, string item, IntPtr unused);

    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length != 4) return 1;
        try
        {
            string shortcut = Path.GetFullPath(args[0]);
            string target = Path.GetFullPath(args[1]);
            string icon = Path.GetFullPath(args[2]);
            if (!File.Exists(shortcut) || !File.Exists(icon)) return 0;

            dynamic shell = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application", true));
            dynamic folder = shell.NameSpace(Path.GetDirectoryName(shortcut));
            if (folder == null) return 0;
            dynamic item = folder.ParseName(Path.GetFileName(shortcut));
            if (item == null || !String.Equals((string)item.ExtendedProperty("System.AppUserModel.ID"),
                    args[3], StringComparison.Ordinal)) return 0;

            dynamic wsh = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell", true));
            dynamic link = wsh.CreateShortcut(shortcut);
            if (!String.Equals((string)link.TargetPath, target, StringComparison.OrdinalIgnoreCase)) return 0;
            string location = icon + ",0";
            if (String.Equals((string)link.IconLocation, location, StringComparison.OrdinalIgnoreCase)) return 0;
            link.IconLocation = location;
            link.Save();
            SHChangeNotify(0x2000, 5, shortcut, IntPtr.Zero); // SHCNE_UPDATEITEM, SHCNF_PATHW
            return 0;
        }
        catch (Exception)
        {
            return 1;
        }
    }
}
