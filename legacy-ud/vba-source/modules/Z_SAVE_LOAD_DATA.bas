Attribute VB_Name = "Z_SAVE_LOAD_DATA"

' #####  SAVE AND LOAD DATA TO FOLDER ###########################################################################################
   
    Sub Save_Data()

            List_Top_Col = Sheets("Home").Range("Building_List_Top").Column
            List_Top_Row = Sheets("Home").Range("Building_List_Top").Row
            Building_Name = Sheets("Home").Cells(List_Top_Row, List_Top_Col) ' Gets first Building Abbreviation
            ExportCount = 0
            While Building_Name > ""
            
                Sheets(Building_Name).Rows("1:100").EntireRow.Hidden = False
                ExportSheetData (Building_Name)
                 
                ExportCount = ExportCount + 1
                List_Top_Row = List_Top_Row + 1
                Building_Name = Sheets("Home").Cells(List_Top_Row, List_Top_Col) ' Gets first Building Abbreviation
            
            Wend
            
            Ans = MsgBox(ExportCount & " Building's Data Saved", vbOKOnly, "DATA EXPORT DONE")

    End Sub

    Sub Load_Data()
    
          Application.ScreenUpdating = False
    
           List_Top_Col = Sheets("Home").Range("Building_List_Top").Column
           List_Top_Row = Sheets("Home").Range("Building_List_Top").Row
           Building_Name = Sheets("Home").Cells(List_Top_Row, List_Top_Col)  ' Gets first Building Name
           ExportCount = 0
           While Building_Name > ""
    
               ImportSheetData (Building_Name)
               ExportCount = ExportCount + 1
    
               List_Top_Row = List_Top_Row + 1
               Building_Name = Sheets("Home").Cells(List_Top_Row, List_Top_Col)   ' Gets first Building Abbreviation
    
           Wend
    
           Ans = MsgBox(ExportCount & " Building's Data Restored", vbOKOnly, "DATA EXPORT DONE")
           Application.ScreenUpdating = True
     
    End Sub

    
Sub ImportSheetData(Building_Name As String)

      
        AllData = ""
        Local_Folder_Path = Application.ActiveWorkbook.Path & "\Building_Data"
        
        Filename = Local_Folder_Path & "\" & Building_Name & ".Readings"
        Open Filename For Input As #1
            ThisRow = 1
            Do Until EOF(1)
                Line Input #1, DataRow
                AllData = AllData & DataRow & vbCrLf
            Loop
        Close #1
        
        Set MyData = New DataObject
        
        MyData.SetText AllData
        Pause (0.1)
        
        MyData.PutInClipboard
        Pause (0.1)
        
        '  Abri = GetBuildingSheetName(Building_Name)
            
         '  Unhide all HIDDEN cells for correct importing of Data
            Cells.Select: Selection.EntireColumn.Hidden = False: Selection.EntireRow.Hidden = False
    
        Sheets(Building_Name).Activate
        Sheets(Building_Name).Range("A1").Select
        Sheets(Building_Name).Paste
        Sheets(Building_Name).Range("A1").Select
        
JumpOut:
     
End Sub

 
Sub ExportSheetData(SheetName As String)

    Local_Folder_Path = Application.ActiveWorkbook.Path & "\Building_Data"
      
    On Error Resume Next
        VBA.FileSystem.MkDir (Local_Folder_Path)
    On Error GoTo 0
    
    ' #### SAVES SHEET DATA TO A FILE ####
        Sheets(SheetName).Cells.Copy
        Filename = Local_Folder_Path & "\" & SheetName & ".Readings"
        With New DataObject
            .GetFromClipboard
            Open Filename For Output As #1: Print #1, .GetText: Close #1
        End With
     
End Sub
 
' #### SAVE AND LOAD DATA PER SHEET ######################################################################
    
    Sub ExportThisSheetOnly()
    
        SheetName = ActiveSheet.Name
        ExportSheetData (SheetName)
    
    End Sub
    
    Sub ImportThisSheetOnly()
    
        SheetName = ActiveSheet.Name
        ImportSheetData (SheetName)
    
    End Sub
    
' ########################################################################################################


 








