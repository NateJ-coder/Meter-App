Attribute VB_Name = "F_BCM_Out"
 
' OUTPUT FOR BCM %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
Sub BCM_Output()
Attribute BCM_Output.VB_ProcData.VB_Invoke_Func = "B\n14"

 
'  This Routine prepares the data in a format which is acceptable to BCM Trac for import to produce Invoices
 
    
    ' Content to include --------------------------------
    ' Read table from Settings Sheet
    ' Sheets("Settings").Visible = True
 
    ' Output Units
    Dim OutputText As String
    Dim ElecTarrif As Double
  
    ' Clear Sheet ----------------------------------
    Sheets("BCM Output").Visible = True
    Sheets("BCM Output").Activate
    Sheets("BCM Output").Cells(1, 1).Select
    
    Sheets("BCM Output").Range("A3:D1000").ClearFormats
    Sheets("BCM Output").Range("A3:D1000").ClearContents
    
    ' Sets up some titles for readability purposes only
    Sheets("BCM Output").Cells(1, 2) = "BCM EXPORT FORMAT"
    Sheets("BCM Output").Cells(2, 1) = "UNIT"
    Sheets("BCM Output").Cells(2, 2) = BuildingName & " : " & SelDate
    Sheets("BCM Output").Cells(2, 3) = "Excl VAT"
    Sheets("BCM Output").Cells(2, 4) = "Incl VAT"

' #### Read Checkbox results to decide what to INCLUDE ###########

    ThisRow = 2: ThisCol = 9: IncludeElectricityConsumption = Sheets("BCM Output").Cells(ThisRow, ThisCol)
    ThisRow = ThisRow + 1: IncludeWaterConsumption = Sheets("BCM Output").Cells(ThisRow, ThisCol)
    
    ThisRow = ThisRow + 1: IncludeElecCommonProp = Sheets("BCM Output").Cells(ThisRow, ThisCol)
    ThisRow = ThisRow + 1: IncludeElecServiceCharge = Sheets("BCM Output").Cells(ThisRow, ThisCol)
    ThisRow = ThisRow + 1: IncludeElecNetworkCharge = Sheets("BCM Output").Cells(ThisRow, ThisCol)
    
    ThisRow = ThisRow + 1: IncludeWaterCommonProp = Sheets("BCM Output").Cells(ThisRow, ThisCol)
    ThisRow = ThisRow + 1: IncludeWaterDemandLevy = Sheets("BCM Output").Cells(ThisRow, ThisCol)
    ThisRow = ThisRow + 1: IncludeWaterSurcharge = Sheets("BCM Output").Cells(ThisRow, ThisCol)
    
    ThisRow = ThisRow + 1: IncludeSewer = Sheets("BCM Output").Cells(ThisRow, ThisCol)
    ThisRow = ThisRow + 1: IncludeRefuse = Sheets("BCM Output").Cells(ThisRow, ThisCol)
 
 ' -----------------------------------------------------------------
 
    Dim Offset As Integer: GetOffset = 7

    LineCount = 2
     For UnitNo = 1 To ElecUnitCount
             
        ' ELECTRICITY ----------------------------------------------------------------------------------------------------------------
       ' If IncludeElectricityConsumption = True And PrepaidElecInstalled(UnitNo) = 0 Then
        If IncludeElectricityConsumption = True Then
             
            ElecOutputText = "Elec:(" & PrevDate & ": " & ElecPrevReadings(UnitNo) & ")-(" & SelDate & ": " & ElecThisReadings(UnitNo) & ")= " & ElecUnitCons(UnitNo)
            ThisAmount = UnitElecCost(UnitNo)
            
            If PrepaidElecInstalled(UnitNo) > 0 Then ThisAmount = 0
            
            If IncludeElecCommonProp = True Then
                ElecOutputText = ElecOutputText & " ComP: " & Format(ElecBulkDiff(UnitNo), "#.00")
                ThisAmount = ThisAmount + ElecBulkDiff(UnitNo)
            End If
            
            If IncludeElecServiceCharge = True Then
                ElecOutputText = ElecOutputText & " Serv: " & Format(OptionCharge2(UnitNo), "#.00")
                 ThisAmount = ThisAmount + OptionCharge2(UnitNo)
            End If
            
            If IncludeElecNetworkCharge = True Then
                ElecOutputText = ElecOutputText & " Netw: " & Format(OptionCharge3(UnitNo), "#.00")
                 ThisAmount = ThisAmount + OptionCharge3(UnitNo)
            End If
            
            LineCount = LineCount + 1
            Sheets("BCM Output").Cells(LineCount, 1) = UnitNames(UnitNo)
            Sheets("BCM Output").Cells(LineCount, 2) = ElecOutputText
            Sheets("BCM Output").Cells(LineCount, 3) = Format(ThisAmount, "#.00")
            Sheets("BCM Output").Cells(LineCount, 4) = Format(ThisAmount * (1 + VatPercent), "#.00")
        
        End If


        ' WATER ----------------------------------------------------
        If IncludeWaterConsumption = True And PrepaidWaterInstalled(i) = 0 Then
           
            WaterOutputText = "Water: (" & PrevDate & ": " & WaterPrevReadings(UnitNo) & ")-(" & SelDate & ": " & WaterThisReadings(UnitNo) & ")= " & WaterUnitCons(UnitNo)
            ThisAmount = UnitWaterCost(UnitNo)
           
            If IncludeWaterCommonProp = True Then
                ' WaterOutputText = WaterOutputText & " ComP: " & Format(WaterBulkDiff(UnitNo), "#.00")
                WaterOutputText = WaterOutputText & " Serv: " & Format(WaterBulkDiff(UnitNo), "#.00")
                ThisAmount = ThisAmount + WaterBulkDiff(UnitNo)
            End If
            
            If IncludeWaterDemandLevy = True Then
                WaterOutputText = WaterOutputText & " Levy: " & Format(OptionCharge5(UnitNo), "#.00")
                ThisAmount = ThisAmount + OptionCharge5(UnitNo)
            End If
            
            If IncludeWaterSurcharge = True Then
                WaterOutputText = WaterOutputText & " SurC: " & Format(OptionCharge6(UnitNo), "#.00")
                ThisAmount = ThisAmount + OptionCharge6(UnitNo)
            End If
            
            LineCount = LineCount + 1
            Sheets("BCM Output").Cells((LineCount), 1) = UnitNames(UnitNo)
            Sheets("BCM Output").Cells((LineCount), 2) = WaterOutputText
            Sheets("BCM Output").Cells((LineCount), 3) = Format(ThisAmount, "#.00")
            Sheets("BCM Output").Cells((LineCount), 4) = Format(ThisAmount * (1 + VatPercent), "#.00")
        End If


      ' SANITATION ----------------------------------------------------
        If IncludeSewer = True Then
            ThisAmount = Format(OptionCharge7(UnitNo), "#.00")
              
            SanOutputText = OptionText7 & " " & PrevDate & " - " & SelDate
            LineCount = LineCount + 1
            Sheets("BCM Output").Cells((LineCount), 1) = UnitNames(UnitNo)
            Sheets("BCM Output").Cells((LineCount), 2) = SanOutputText
            Sheets("BCM Output").Cells((LineCount), 3) = Format(ThisAmount, "#.00")
            Sheets("BCM Output").Cells((LineCount), 4) = Format(ThisAmount * (1 + VatPercent), "#.00")
        End If
        
        
        ' Refuse ----------------------------------------------------
        If IncludeRefuse = True Then
            ThisAmount = Format(OptionCharge8(UnitNo), "#.00")
           
            RefOutputText = OptionText8 & " " & PrevDate & " - " & SelDate
            LineCount = LineCount + 1
            Sheets("BCM Output").Cells((LineCount), 1) = UnitNames(UnitNo)
            Sheets("BCM Output").Cells((LineCount), 2) = RefOutputText
            Sheets("BCM Output").Cells((LineCount), 3) = Format(ThisAmount, "#.00")
            Sheets("BCM Output").Cells((LineCount), 4) = Format(ThisAmount * (1 + VatPercent), "#.00")
        End If
        Sheets("BCM Output").Range(Cells(LineCount, 1), Cells(LineCount, 4)).Borders(xlEdgeBottom).LineStyle = xlContinuous
     Next

 End Sub

Sub CheckAll()

    Dim Check As Boolean

    Check = Sheets("BCM Output").Range("I2")
    If Check = True Then
        Check = False
        Else
        Check = True
    End If
    
    Sheets("BCM Output").Range("I2") = Check
    Sheets("BCM Output").Range("I3") = Check
    Sheets("BCM Output").Range("I4") = Check
    Sheets("BCM Output").Range("I5") = Check
    Sheets("BCM Output").Range("I6") = Check
    Sheets("BCM Output").Range("I7") = Check
    Sheets("BCM Output").Range("I8") = Check
    Sheets("BCM Output").Range("I9") = Check
    Sheets("BCM Output").Range("I10") = Check
    Sheets("BCM Output").Range("I11") = Check
    
    BCM_Output
    
End Sub

Sub Macro7()
Attribute Macro7.VB_ProcData.VB_Invoke_Func = " \n14"

    Columns("A:E").HorizontalAlignment = xlCenter
    Range("D1").HorizontalAlignment = xlLeft
End Sub
